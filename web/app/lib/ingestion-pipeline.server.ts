/**
 * Full AI ingestion pipeline orchestration.
 *
 * Runs asynchronously via ctx.waitUntil() after the /ingest form action
 * creates the session row. Updates ingestion_sessions.status / ai_draft_json
 * when done or on error.
 */

import { eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import * as schema from "~/db/schema"
import { sendIngestionCompleteEmail } from "./email.server"
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
import {
  exportFileAsPdf,
  exportFileAsText,
  extractFileId,
  refreshAccessToken,
} from "./google-drive.server"
import { tiptapToMarkdown } from "./tiptap-convert"

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
      googleDocText?: string
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
    googleDocText?: string
  },
): Promise<void> {
  const db = drizzle(env.DB, { schema })

  try {
    const baseUserText = inputs.texts.join("\n\n")
    let fileUris: { uri: string; mimeType: string }[]
    const warnings: string[] = []
    const docTexts: string[] = []

    if (resumeContext) {
      // Resuming after clarification — reuse already-uploaded files + doc text
      fileUris = resumeContext.fileUris
      if (resumeContext.googleDocText) {
        docTexts.push(resumeContext.googleDocText)
      }
    } else {
      fileUris = []

      await updatePhase(db, sessionId, "parsing")

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
      // Step 2: If Google Drive URL, export text (required) + PDF (best-effort)
      // ------------------------------------------------------------------
      for (const docUrl of inputs.googleDocUrls) {
        const fileId = extractFileId(docUrl)

        const tokenRow = await db
          .select()
          .from(schema.googleDriveTokens)
          .where(eq(schema.googleDriveTokens.userId, userId))
          .get()

        if (!tokenRow) {
          throw new Error(
            `Google Driveの認証が見つかりません。設定画面からGoogle Driveを再接続してください。(URL: ${docUrl})`,
          )
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

        // Primary: extract plain text (must succeed)
        const docText = await exportFileAsText(fileId, accessToken)
        docTexts.push(docText)

        // Best-effort: upload PDF for rich content (images, tables)
        try {
          const exported = await exportFileAsPdf(fileId, accessToken)
          if (exported.warning) warnings.push(exported.warning)

          const uri = await uploadFileToGemini(
            exported.buffer,
            exported.mimeType,
            `google-drive-${fileId}`,
            env.GEMINI_API_KEY,
          )
          fileUris.push({ uri, mimeType: exported.mimeType })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          warnings.push(
            `Google DriveファイルのPDFアップロードに失敗しました（テキストは取得済み）: ${msg}`,
          )
        }
      }

      // Combine base text + doc texts into userText
      const combinedTexts = [baseUserText, ...docTexts].filter((t) => t.trim().length > 0)
      const userText = combinedTexts.join("\n\n---\n\n")

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
          googleDocText: docTexts.join("\n\n---\n\n"),
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
    const combinedTexts = [baseUserText, ...docTexts].filter((t) => t.trim().length > 0)
    const userText = combinedTexts.join("\n\n---\n\n")
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
    await updatePhase(db, sessionId, "planning")
    const rawPlan = await runPhase1Planner(
      env.GEMINI_API_KEY,
      effectiveUserText,
      fileUris,
      pageIndex,
    )

    // ------------------------------------------------------------------
    // Step 4b: Phase 1b — Merger (consolidate overlapping creates)
    // ------------------------------------------------------------------
    await updatePhase(db, sessionId, "merging")
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

    await updatePhase(db, sessionId, `generating:0/${total}`)

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
        await updatePhase(db, sessionId, `generating:${done}/${total}`)
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
        await updatePhase(db, sessionId, `generating:${done}/${total}`)
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
    await updatePhase(db, sessionId, "saving")
    await db
      .update(schema.ingestionSessions)
      .set({
        aiDraftJson: JSON.stringify(aiDraftJson),
        status: "done",
        phaseMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.ingestionSessions.id, sessionId))

    // Send completion email (best-effort — never block pipeline)
    try {
      const userRow = await db
        .select({ name: schema.user.name, email: schema.user.email })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .get()

      if (userRow) {
        const siteUrl = (env.BETTER_AUTH_URL ?? "").replace(/\/$/, "")
        const reviewUrl = `${siteUrl}/ingest/${sessionId}`
        await sendIngestionCompleteEmail(env, {
          to: userRow.email,
          userName: userRow.name,
          sessionId,
          reviewUrl,
        })
        await db
          .update(schema.ingestionSessions)
          .set({ notifiedAt: new Date() })
          .where(eq(schema.ingestionSessions.id, sessionId))
      }
    } catch (emailErr) {
      console.error(
        `[ingestion-pipeline] email notification failed for session=${sessionId}:`,
        emailErr,
      )
    }
  } catch (err) {
    console.error(`[ingestion-pipeline] session=${sessionId} error:`, err)
    const rawMessage = err instanceof Error ? err.message : String(err)
    // Surface Google Drive errors directly to the user
    const isGoogleDriveError =
      rawMessage.includes("Google Drive") || rawMessage.includes("Google Doc")
    const errorMessage = isGoogleDriveError
      ? rawMessage
      : "Ingestion failed due to an internal error."
    await drizzle(env.DB, { schema })
      .update(schema.ingestionSessions)
      .set({
        status: "error",
        errorMessage,
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
  // Always fetch all published pages so the AI planner never misses existing pages.
  // FTS5 with unicode61 tokenizer cannot segment Japanese text, so relying on
  // MATCH alone would miss obvious matches (e.g. "配信スタッフ" vs "配信ガイドライン").
  // Instead, we fetch all pages and use FTS5 only to boost relevant ones to the top.

  const allPages = await db
    .select({
      id: schema.pages.id,
      titleJa: schema.pages.titleJa,
      summaryJa: schema.pages.summaryJa,
      slug: schema.pages.slug,
      parentId: schema.pages.parentId,
    })
    .from(schema.pages)
    .where(eq(schema.pages.status, "published"))
    .limit(200)
    .all()

  if (allPages.length === 0) return []

  // Try FTS5 to determine relevance ordering
  const ftsRankedIds: string[] = []
  try {
    // Sanitize FTS5 operators: strip quotes, wildcards, grouping, column filters,
    // and the NOT operator (-) which would otherwise negate terms.
    const sanitized = userText
      .replace(/["'*^():{}[\]<>~@#$&|\\+\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500)

    if (sanitized) {
      // Use OR so any matching token contributes to ranking
      const orQuery = sanitized.split(" ").filter(Boolean).join(" OR ")
      const ftsResults = await db.all<{ page_id: string }>(
        sql`SELECT page_id FROM pages_fts
            WHERE pages_fts MATCH ${orQuery}
            ORDER BY rank
            LIMIT 200`,
      )
      for (const r of ftsResults) {
        ftsRankedIds.push(r.page_id)
      }
    }
  } catch {
    // FTS5 query failed — proceed with unranked pages
  }

  // Build result: FTS-matched pages first (by relevance), then remaining pages
  const ftsSet = new Set(ftsRankedIds)
  const toEntry = (r: (typeof allPages)[number]): PageIndexEntry => ({
    id: r.id,
    title: r.titleJa,
    summary: r.summaryJa,
    slug: r.slug,
    parentId: r.parentId,
  })

  const allPagesById = new Map(allPages.map((p) => [p.id, p]))
  const ranked = ftsRankedIds
    .map((id) => allPagesById.get(id))
    .filter((p): p is (typeof allPages)[number] => p != null)
    .map(toEntry)

  const unranked = allPages.filter((p) => !ftsSet.has(p.id)).map(toEntry)

  return [...ranked, ...unranked]
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
