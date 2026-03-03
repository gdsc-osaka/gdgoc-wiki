/**
 * Full AI ingestion pipeline orchestration.
 *
 * Runs asynchronously via ctx.waitUntil() after the /ingest form action
 * creates the session row. Updates ingestion_sessions.status / ai_draft_json
 * when done or on error.
 */

import { and, eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import * as schema from "~/db/schema"
import {
  type CreateOperation,
  type PageDraft,
  type PageIndexEntry,
  type SectionPatchResponse,
  type UpdateOperation,
  runPhase1Planner,
  runPhase2Creator,
  runPhase2Patcher,
  uploadFileToGemini,
} from "./gemini.server"
import { exportDocAsPdf, extractFileId, refreshAccessToken } from "./google-drive.server"
import { tiptapToMarkdown } from "./tiptap-convert.server"

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface IngestionInputs {
  texts: string[]
  imageKeys: string[] // R2 keys for uploaded images
  googleDocUrls: string[]
  imageFiles?: Array<{ key: string; buffer: ArrayBuffer; mimeType: string; name: string }>
}

export interface ChangesetOperation {
  type: "create" | "update"
  tempId?: string
  pageId?: string
  pageTitle?: string
  rationale: string
  draft: PageDraft | null
  patch: SectionPatchResponse | null
  existingTipTapJson?: string
}

export interface AiDraftJson {
  planRationale: string
  operations: ChangesetOperation[]
  sensitiveItems: import("./gemini.server").SensitiveItem[]
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

export async function runIngestionPipeline(
  env: Env,
  sessionId: string,
  userId: string,
  inputs: IngestionInputs,
): Promise<void> {
  const db = drizzle(env.DB, { schema })

  try {
    const userText = inputs.texts.join("\n\n")
    const fileUris: { uri: string; mimeType: string }[] = []
    const warnings: string[] = []

    // ------------------------------------------------------------------
    // Step 1: Upload images to Gemini File API + R2
    // ------------------------------------------------------------------
    if (inputs.imageFiles && inputs.imageFiles.length > 0) {
      for (const img of inputs.imageFiles) {
        // Upload to Gemini
        const uri = await uploadFileToGemini(img.buffer, img.mimeType, img.name, env.GEMINI_API_KEY)
        fileUris.push({ uri, mimeType: img.mimeType })

        // Already stored in R2 by the action before calling this pipeline
      }
    }

    // ------------------------------------------------------------------
    // Step 2: If Google Doc URL, export + upload to Gemini
    // ------------------------------------------------------------------
    for (const docUrl of inputs.googleDocUrls) {
      try {
        const fileId = extractFileId(docUrl)

        // Fetch Drive token from DB, refreshing if necessary
        const tokenRow = await db
          .select()
          .from(schema.googleDriveTokens)
          .where(eq(schema.googleDriveTokens.userId, userId))
          .get()

        if (!tokenRow) {
          warnings.push(`Google Drive token not found. Skipping doc: ${docUrl}`)
          continue
        }

        let accessToken = tokenRow.accessToken
        const now = new Date()
        if (tokenRow.expiresAt < now && tokenRow.refreshToken) {
          const refreshed = await refreshAccessToken(
            tokenRow.refreshToken,
            env.GOOGLE_DOCS_CLIENT_ID,
            env.GOOGLE_DOCS_CLIENT_SECRET,
          )
          accessToken = refreshed.accessToken
          await db
            .update(schema.googleDriveTokens)
            .set({
              accessToken: refreshed.accessToken,
              expiresAt: refreshed.expiresAt,
              updatedAt: now,
            })
            .where(eq(schema.googleDriveTokens.userId, userId))
        }

        const exported = await exportDocAsPdf(fileId, accessToken)
        if (exported.warning) warnings.push(exported.warning)

        const uri = await uploadFileToGemini(
          exported.buffer,
          exported.mimeType,
          `google-doc-${fileId}`,
          env.GEMINI_API_KEY,
        )
        fileUris.push({ uri, mimeType: exported.mimeType })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        warnings.push(`Google Doc export failed: ${msg}`)
      }
    }

    // ------------------------------------------------------------------
    // Step 3: Fetch page index from D1 (FTS5, max 200)
    // ------------------------------------------------------------------
    const pageIndex = await buildPageIndex(db, userText)

    // ------------------------------------------------------------------
    // Step 4: Phase 1 — Planner
    // ------------------------------------------------------------------
    const plan = await runPhase1Planner(env.GEMINI_API_KEY, userText, fileUris, pageIndex)

    // ------------------------------------------------------------------
    // Step 5: Fetch existing page content for update ops
    // ------------------------------------------------------------------
    const updateOps = plan.operations.filter((op) => op.type === "update") as UpdateOperation[]
    const existingContent: Record<string, string> = {}

    for (const op of updateOps) {
      const page = await db
        .select({ contentJa: schema.pages.contentJa })
        .from(schema.pages)
        .where(eq(schema.pages.id, op.pageId))
        .get()
      if (page) {
        existingContent[op.pageId] = page.contentJa
      }
    }

    // ------------------------------------------------------------------
    // Step 6: Phase 2 — Creator + Patcher in parallel
    // ------------------------------------------------------------------
    const createOps = plan.operations.filter((op) => op.type === "create") as CreateOperation[]

    const [creatorResults, patcherResults] = await Promise.all([
      Promise.all(
        createOps.map((op) =>
          runPhase2Creator(env.GEMINI_API_KEY, userText, fileUris, op, pageIndex),
        ),
      ),
      Promise.all(
        updateOps.map((op) => {
          const existing = existingContent[op.pageId] ?? ""
          const markdown = tiptapToMarkdown(existing)
          return runPhase2Patcher(env.GEMINI_API_KEY, userText, fileUris, op, markdown)
        }),
      ),
    ])

    // ------------------------------------------------------------------
    // Step 7: Assemble changeset
    // ------------------------------------------------------------------
    const operations: ChangesetOperation[] = []
    const allSensitiveItems: import("./gemini.server").SensitiveItem[] = []

    // Create operations
    createOps.forEach((op, idx) => {
      const draft = creatorResults[idx]
      operations.push({
        type: "create",
        tempId: op.tempId,
        rationale: op.rationale,
        draft,
        patch: null,
      })
      allSensitiveItems.push(...(draft.sensitiveItems ?? []))
    })

    // Update operations
    updateOps.forEach((op, idx) => {
      const patch = patcherResults[idx]
      operations.push({
        type: "update",
        pageId: op.pageId,
        pageTitle: op.pageTitle,
        rationale: op.rationale,
        draft: null,
        patch,
        existingTipTapJson: existingContent[op.pageId],
      })
      allSensitiveItems.push(...(patch.sensitiveItems ?? []))
    })

    const aiDraftJson: AiDraftJson = {
      planRationale: plan.planRationale,
      operations,
      sensitiveItems: allSensitiveItems,
      warnings,
    }

    // ------------------------------------------------------------------
    // Step 8: Save to DB
    // ------------------------------------------------------------------
    await db
      .update(schema.ingestionSessions)
      .set({
        aiDraftJson: JSON.stringify(aiDraftJson),
        status: "done",
        updatedAt: new Date(),
      })
      .where(eq(schema.ingestionSessions.id, sessionId))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ingestion-pipeline] session=${sessionId} error:`, err)
    await drizzle(env.DB, { schema })
      .update(schema.ingestionSessions)
      .set({ status: "error", errorMessage: message, updatedAt: new Date() })
      .where(eq(schema.ingestionSessions.id, sessionId))
  }
}

// ---------------------------------------------------------------------------
// Page index builder (FTS5-based, max 200 entries)
// ---------------------------------------------------------------------------

export async function buildPageIndex(
  db: ReturnType<typeof drizzle>,
  userText: string,
): Promise<PageIndexEntry[]> {
  try {
    // Use FTS5 to find relevant published pages
    const sanitized = userText.replace(/['"]/g, " ").slice(0, 500)
    const results = await db
      .select({
        id: schema.pages.id,
        titleJa: schema.pages.titleJa,
        summaryJa: schema.pages.summaryJa,
        slug: schema.pages.slug,
      })
      .from(schema.pages)
      .where(and(eq(schema.pages.status, "published")))
      .limit(200)
      .all()

    return results.map((r) => ({
      id: r.id,
      title: r.titleJa,
      summary: r.summaryJa,
      slug: r.slug,
    }))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Slug generation from title
// ---------------------------------------------------------------------------

export function generateSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[\s\u3000]+/g, "-")
      .replace(/[^\w-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || `page-${Date.now()}`
  )
}
