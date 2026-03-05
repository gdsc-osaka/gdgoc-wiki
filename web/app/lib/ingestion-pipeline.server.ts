/**
 * Full AI ingestion pipeline orchestration.
 *
 * Runs asynchronously via a Cloudflare Queue consumer (or waitUntil in local
 * development fallback paths). Updates ingestion_sessions.status / ai_draft_json
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
import { type ExtractedUrl, extractUrls, fetchUrlViaJina } from "./url-extract"

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
      fetchedUrlContent?: string
    }
  | {
      phase: "url_selection"
      urls: ExtractedUrl[]
      fileUris: { uri: string; mimeType: string }[]
      googleDocText?: string
    }
  | {
      phase: "resume_post_clarification"
      fileUris: { uri: string; mimeType: string }[]
      clarificationAnswers: string
      googleDocText?: string
      fetchedUrlContent?: string
    }
  | {
      phase: "resume_post_url_selection"
      fileUris: { uri: string; mimeType: string }[]
      selectedUrls: string[]
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
// Helpers
// ---------------------------------------------------------------------------

function buildUserText(baseUserText: string, docTexts: string[]): string {
  return [baseUserText, ...docTexts].filter((t) => t.trim().length > 0).join("\n\n---\n\n")
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
    selectedUrls?: string[]
    fetchedUrlContent?: string
  },
): Promise<void> {
  const db = drizzle(env.DB, { schema })

  try {
    const baseUserText = inputs.texts.join("\n\n")
    let fileUris: { uri: string; mimeType: string }[]
    const warnings: string[] = []
    const docTexts: string[] = []

    // Determine resume type
    const isPostClarification = !!resumeContext?.clarificationAnswers
    const isPostUrlSelection = !!resumeContext?.selectedUrls && !isPostClarification

    if (resumeContext) {
      // Resuming — reuse already-uploaded files + doc text
      fileUris = resumeContext.fileUris
      if (resumeContext.googleDocText) {
        docTexts.push(resumeContext.googleDocText)
      }
    } else {
      fileUris = []

      await updatePhase(db, sessionId, "parsing")

      // ------------------------------------------------------------------
      // Step 1: Upload images to Gemini File API
      // ------------------------------------------------------------------
      const imageFiles =
        inputs.imageFiles && inputs.imageFiles.length > 0
          ? inputs.imageFiles
          : await Promise.all(
              inputs.imageKeys.map(async (key) => {
                const obj = await env.BUCKET.get(key)
                if (!obj) throw new Error(`Uploaded image not found in R2: ${key}`)
                return {
                  key,
                  buffer: await obj.arrayBuffer(),
                  mimeType: obj.httpMetadata?.contentType ?? "application/octet-stream",
                  name: key.split("/").at(-1) ?? key,
                }
              }),
            )

      if (imageFiles.length > 0) {
        for (const img of imageFiles) {
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
          try {
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
          } catch (refreshErr) {
            const msg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr)
            throw new Error(
              `Google Driveのアクセスが無効になりました。設定画面からGoogle Driveを再接続してください。(${msg})`,
            )
          }
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

      // ------------------------------------------------------------------
      // Step 2.5: Extract URLs from user text + Google Doc text
      // ------------------------------------------------------------------
      const allExtractedUrls: ExtractedUrl[] = []
      const seenUrls = new Set<string>()

      for (const extracted of extractUrls(baseUserText, "user_text")) {
        if (!seenUrls.has(extracted.url)) {
          seenUrls.add(extracted.url)
          allExtractedUrls.push(extracted)
        }
      }
      for (const docText of docTexts) {
        for (const extracted of extractUrls(docText, "google_doc")) {
          if (!seenUrls.has(extracted.url)) {
            seenUrls.add(extracted.url)
            allExtractedUrls.push(extracted)
          }
        }
      }

      // Cap at 5 URLs total
      const urlsToShow = allExtractedUrls.slice(0, 5)

      if (urlsToShow.length > 0) {
        const aiDraftJson: AiDraftJson = {
          phase: "url_selection",
          urls: urlsToShow,
          fileUris,
          googleDocText: docTexts.join("\n\n---\n\n"),
        }
        await db
          .update(schema.ingestionSessions)
          .set({
            aiDraftJson: JSON.stringify(aiDraftJson),
            status: "awaiting_url_selection",
            phaseMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.ingestionSessions.id, sessionId))
        return
      }
    }

    // ------------------------------------------------------------------
    // Step 2.6: Fetch selected URLs via Jina.ai (if resuming from URL selection)
    // ------------------------------------------------------------------
    let fetchedUrlContent = resumeContext?.fetchedUrlContent ?? ""

    if (
      isPostUrlSelection &&
      resumeContext?.selectedUrls &&
      resumeContext.selectedUrls.length > 0
    ) {
      await updatePhase(db, sessionId, "fetching_urls")
      const parts: string[] = []
      for (const url of resumeContext.selectedUrls) {
        const result = await fetchUrlViaJina(url)
        if (result.error) {
          parts.push(`### ${url}\n(取得失敗: ${result.error})`)
        } else {
          const suffix = result.truncated ? "\n\n(... 10,000文字で切り詰めました)" : ""
          parts.push(`### ${url}\n${result.markdown}${suffix}`)
        }
      }
      fetchedUrlContent = parts.join("\n\n")
    }

    // ------------------------------------------------------------------
    // Phase 0: Clarifier (runs on first run OR after URL selection)
    // ------------------------------------------------------------------
    if (!isPostClarification) {
      const userText = buildUserText(baseUserText, docTexts)
      let clarifierText = userText
      if (fetchedUrlContent) {
        clarifierText += `\n\n---\n## 参考URL（ユーザーが選択した外部ページ）\n${fetchedUrlContent}`
      }

      const clarifierResult = await runPhase0Clarifier(env.GEMINI_API_KEY, clarifierText, fileUris)

      if (clarifierResult.needsClarification) {
        const aiDraftJson: AiDraftJson = {
          phase: "clarification",
          questions: clarifierResult.questions,
          summary: clarifierResult.summary,
          fileUris,
          googleDocText: docTexts.join("\n\n---\n\n"),
          fetchedUrlContent: fetchedUrlContent || undefined,
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
    const userText = buildUserText(baseUserText, docTexts)

    let effectiveUserText = isPostClarification
      ? `${resumeContext?.clarificationAnswers}\n\n${userText}`
      : userText

    if (fetchedUrlContent) {
      effectiveUserText += `\n\n---\n## 参考URL（ユーザーが選択した外部ページ）\n${fetchedUrlContent}`
    }

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

    // Create notification + best-effort email (never block pipeline)
    try {
      const reviewUrl = `/ingest/${sessionId}`
      const notificationId = crypto.randomUUID()
      await db.insert(schema.notifications).values({
        id: notificationId,
        userId,
        type: "ingestion_done",
        titleJa: "下書きの確認準備完了",
        titleEn: "Draft ready for review",
        refId: sessionId,
        refUrl: reviewUrl,
      })

      try {
        const userRow = await db
          .select({ name: schema.user.name, email: schema.user.email })
          .from(schema.user)
          .where(eq(schema.user.id, userId))
          .get()

        if (userRow) {
          const siteUrl = (env.BETTER_AUTH_URL ?? "").replace(/\/$/, "")
          await sendIngestionCompleteEmail(env, {
            to: userRow.email,
            userName: userRow.name,
            sessionId,
            reviewUrl: `${siteUrl}${reviewUrl}`,
          })
          await db
            .update(schema.notifications)
            .set({ emailedAt: new Date() })
            .where(eq(schema.notifications.id, notificationId))
        }
      } catch (emailErr) {
        console.error(
          `[ingestion-pipeline] email notification failed for session=${sessionId}:`,
          emailErr,
        )
      }
    } catch (notifErr) {
      console.error(
        `[ingestion-pipeline] notification insert failed for session=${sessionId}:`,
        notifErr,
      )
    }
  } catch (err) {
    console.error(`[ingestion-pipeline] session=${sessionId} error:`, err)
    const rawMessage = err instanceof Error ? err.message : String(err)
    // Surface Google Drive / auth errors directly to the user
    const isGoogleDriveError =
      /google\s*(drive|doc)|invalid_grant|invalid_token|refresh.?token|drive\.googleapis\.com|drive\s*api|oauth|access.?token/i.test(
        rawMessage,
      ) || rawMessage.includes("401")
    const errorMessage = isGoogleDriveError
      ? rawMessage
      : "Ingestion failed due to an internal error."
    const errorDb = drizzle(env.DB, { schema })
    await errorDb
      .update(schema.ingestionSessions)
      .set({
        status: "error",
        errorMessage,
        phaseMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.ingestionSessions.id, sessionId))

    // Create error notification (best-effort)
    try {
      await errorDb.insert(schema.notifications).values({
        id: crypto.randomUUID(),
        userId,
        type: "ingestion_error",
        titleJa: "処理に失敗しました",
        titleEn: "Processing failed",
        refId: sessionId,
        refUrl: `/ingest/${sessionId}`,
      })
    } catch {
      // never block error handling
    }
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
