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
  type ClarificationQuestion,
  type ClarificationResult,
  type CreateOperation,
  type PageDraft,
  type PageIndexEntry,
  type SectionPatchResponse,
  type UpdateOperation,
  runPhase0Clarifier,
  runPhase1Merger,
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

export type { ClarificationQuestion, ClarificationResult }

export type AiDraftJson =
  | {
      phase: "clarification"
      questions: ClarificationQuestion[]
      summary: string
      fileUris: { uri: string; mimeType: string }[]
    }
  | {
      phase?: "result"
      planRationale: string
      operations: ChangesetOperation[]
      sensitiveItems: import("./gemini.server").SensitiveItem[]
      warnings: string[]
    }

// ---------------------------------------------------------------------------
// Phase progress helper
// ---------------------------------------------------------------------------

async function updatePhase(
  db: ReturnType<typeof drizzle>,
  sessionId: string,
  message: string,
): Promise<void> {
  await db
    .update(schema.ingestionSessions)
    .set({ phaseMessage: message, updatedAt: new Date() })
    .where(eq(schema.ingestionSessions.id, sessionId))
}

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

export async function runIngestionPipeline(
  env: Env,
  sessionId: string,
  userId: string,
  inputs: IngestionInputs,
  resumeContext?: {
    fileUris: { uri: string; mimeType: string }[]
    clarificationAnswers: string
  },
): Promise<void> {
  const db = drizzle(env.DB, { schema })

  try {
    const userText = inputs.texts.join("\n\n")
    let fileUris: { uri: string; mimeType: string }[]
    const warnings: string[] = []

    if (resumeContext) {
      // Resuming after clarification — reuse already-uploaded files
      fileUris = resumeContext.fileUris
    } else {
      fileUris = []

      await updatePhase(db, sessionId, "入力を解析中...")

      // ------------------------------------------------------------------
      // Step 1: Upload images to Gemini File API + R2
      // ------------------------------------------------------------------
      if (inputs.imageFiles && inputs.imageFiles.length > 0) {
        for (const img of inputs.imageFiles) {
          const uri = await uploadFileToGemini(
            img.buffer,
            img.mimeType,
            img.name,
            env.GEMINI_API_KEY,
          )
          fileUris.push({ uri, mimeType: img.mimeType })
        }
      }

      // ------------------------------------------------------------------
      // Step 2: If Google Doc URL, export + upload to Gemini
      // ------------------------------------------------------------------
      for (const docUrl of inputs.googleDocUrls) {
        try {
          const fileId = extractFileId(docUrl)

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
      // Step 0: Phase 0 — Clarifier
      // ------------------------------------------------------------------
      const clarifierResult = await runPhase0Clarifier(env.GEMINI_API_KEY, userText, fileUris)

      if (clarifierResult.needsClarification) {
        const aiDraftJson: AiDraftJson = {
          phase: "clarification",
          questions: clarifierResult.questions,
          summary: clarifierResult.summary,
          fileUris,
        }
        await db
          .update(schema.ingestionSessions)
          .set({
            aiDraftJson: JSON.stringify(aiDraftJson),
            status: "awaiting_clarification",
            phaseMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.ingestionSessions.id, sessionId))
        return
      }
    }

    // Build final user text (prepend clarification answers if resuming)
    const effectiveUserText = resumeContext
      ? `${resumeContext.clarificationAnswers}\n\n${userText}`
      : userText

    // ------------------------------------------------------------------
    // Step 3: Fetch page index from D1 (FTS5, max 200)
    // ------------------------------------------------------------------
    const pageIndex = await buildPageIndex(db, effectiveUserText)

    // ------------------------------------------------------------------
    // Step 4a: Phase 1a — Planner
    // ------------------------------------------------------------------
    await updatePhase(db, sessionId, "ページ構成を計画中...")
    const rawPlan = await runPhase1Planner(
      env.GEMINI_API_KEY,
      effectiveUserText,
      fileUris,
      pageIndex,
    )

    // ------------------------------------------------------------------
    // Step 4b: Phase 1b — Merger (consolidate overlapping creates)
    // ------------------------------------------------------------------
    await updatePhase(db, sessionId, "重複ページを統合中...")
    const plan = await runPhase1Merger(env.GEMINI_API_KEY, rawPlan, effectiveUserText)

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
    // Step 6: Phase 2 — Creator + Patcher with progress tracking
    // ------------------------------------------------------------------
    const createOps = plan.operations.filter((op) => op.type === "create") as CreateOperation[]
    const total = createOps.length + updateOps.length
    let done = 0

    await updatePhase(db, sessionId, `ページ内容を生成中... (0/${total})`)

    const creatorResults = await Promise.all(
      createOps.map(async (op) => {
        const result = await runPhase2Creator(
          env.GEMINI_API_KEY,
          effectiveUserText,
          fileUris,
          op,
          pageIndex,
          createOps.filter((o) => o.tempId !== op.tempId),
        )
        done++
        await updatePhase(db, sessionId, `ページ内容を生成中... (${done}/${total})`)
        return result
      }),
    )

    const patcherResults = await Promise.all(
      updateOps.map(async (op) => {
        const existing = existingContent[op.pageId] ?? ""
        const markdown = tiptapToMarkdown(existing)
        const result = await runPhase2Patcher(
          env.GEMINI_API_KEY,
          effectiveUserText,
          fileUris,
          op,
          markdown,
        )
        done++
        await updatePhase(db, sessionId, `ページ内容を生成中... (${done}/${total})`)
        return result
      }),
    )

    // ------------------------------------------------------------------
    // Step 7: Assemble changeset
    // ------------------------------------------------------------------
    const operations: ChangesetOperation[] = []
    const allSensitiveItems: import("./gemini.server").SensitiveItem[] = []

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
    await updatePhase(db, sessionId, "保存中...")
    await db
      .update(schema.ingestionSessions)
      .set({
        aiDraftJson: JSON.stringify(aiDraftJson),
        status: "done",
        phaseMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.ingestionSessions.id, sessionId))
  } catch (err) {
    console.error(`[ingestion-pipeline] session=${sessionId} error:`, err)
    await drizzle(env.DB, { schema })
      .update(schema.ingestionSessions)
      .set({
        status: "error",
        errorMessage: "Ingestion failed due to an internal error.",
        phaseMessage: null,
        updatedAt: new Date(),
      })
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
    const sanitized = userText
      .replace(/["'*^()]/g, " ")
      .trim()
      .slice(0, 500)

    if (!sanitized) {
      // No usable text — fall back to recency order
      const fallback = await db
        .select({
          id: schema.pages.id,
          titleJa: schema.pages.titleJa,
          summaryJa: schema.pages.summaryJa,
          slug: schema.pages.slug,
        })
        .from(schema.pages)
        .where(eq(schema.pages.status, "published"))
        .limit(200)
        .all()
      return fallback.map((r) => ({
        id: r.id,
        title: r.titleJa,
        summary: r.summaryJa,
        slug: r.slug,
      }))
    }

    const results = await db.all<{
      id: string
      title_ja: string
      summary_ja: string
      slug: string
    }>(
      sql`SELECT p.id, p.title_ja, p.summary_ja, p.slug
          FROM pages_fts
          JOIN pages p ON pages_fts.page_id = p.id
          WHERE pages_fts MATCH ${sanitized}
            AND p.status = 'published'
          ORDER BY rank
          LIMIT 200`,
    )

    return results.map((r) => ({
      id: r.id,
      title: r.title_ja,
      summary: r.summary_ja,
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
