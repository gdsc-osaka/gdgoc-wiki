/**
 * Full AI ingestion pipeline orchestration.
 *
 * Runs asynchronously via a Cloudflare Queue consumer (or waitUntil in local
 * development fallback paths). Updates ingestion_sessions.status / ai_draft_json
 * when done or on error.
 */

import type { BrowserWorker } from "@cloudflare/puppeteer"
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
  runPhase1Planner,
  runPhase2Creator,
  runPhase2Patcher,
  uploadFileToGemini,
} from "./gemini.server"
import { isGoogleSheetsUrl } from "./google-drive-utils"
import {
  exportFileAsPdf,
  exportFileAsText,
  extractFileId,
  getDriveFileName,
  refreshAccessToken,
} from "./google-drive.server"
import { extractFormId, fetchFormData } from "./google-forms.server"
import { computeSurveyStats, formatSurveyStatsAsText } from "./survey-stats.server"
import { tiptapToMarkdown } from "./tiptap-convert"
import { type ExtractedUrl, extractUrls, fetchUrlAsPdf, fetchUrlViaJina } from "./url-extract"

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface SourceUrl {
  url: string
  title: string
}

export interface IngestionInputs {
  texts: string[]
  imageKeys: string[] // R2 keys for uploaded images
  googleDocUrls: string[]
  imageFiles?: Array<{ key: string; buffer: ArrayBuffer; mimeType: string; name: string }>
  pdfKeys?: string[]
  pdfFiles?: Array<{ key: string; buffer: ArrayBuffer; mimeType: string; name: string }>
  googleFormUrl?: string
  eventTitle?: string
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
      sources?: SourceUrl[]
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
      sources?: SourceUrl[]
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
      sources: SourceUrl[]
      imageKeys: string[]
      pdfKeys: string[]
    }

export type IngestionResumePostClarificationDraft = Extract<
  AiDraftJson,
  { phase: "resume_post_clarification" }
>

export type IngestionResumePostUrlSelectionDraft = Extract<
  AiDraftJson,
  { phase: "resume_post_url_selection" }
>

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
    priorSources?: SourceUrl[]
  },
): Promise<void> {
  console.log("[ingestion-pipeline] runIngestionPipeline start", {
    sessionId,
    userId,
    hasResumeContext: !!resumeContext,
    resumeMode:
      resumeContext?.clarificationAnswers !== undefined
        ? resumeContext.selectedUrls
          ? "post_url_selection"
          : "post_clarification"
        : "fresh",
  })

  const db = drizzle(env.DB, { schema })

  const currentDatetime = `${new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}（JST）`

  try {
    const baseUserText = inputs.texts.join("\n\n")
    let fileUris: { uri: string; mimeType: string }[]
    const warnings: string[] = []
    const docTexts: string[] = []
    const sources: SourceUrl[] = resumeContext?.priorSources ? [...resumeContext.priorSources] : []
    let skipPhase0 = false

    // Determine resume type
    const isPostClarification = !!resumeContext?.clarificationAnswers
    const isPostUrlSelection = !!resumeContext?.selectedUrls && !isPostClarification

    if (resumeContext) {
      // Resuming — reuse already-uploaded files + doc text
      fileUris = resumeContext.fileUris
      if (resumeContext.googleDocText) {
        docTexts.push(resumeContext.googleDocText)
      }
      // Re-collect Google Doc sources (pipeline is stateless between phases).
      // Sources collected in a prior run are discarded when the run returns early
      // (url_selection or clarification phase), so we always re-fetch them on any resume.
      if (inputs.googleDocUrls.length > 0) {
        const seenSourceUrls = new Set(sources.map((s) => s.url))
        const tokenRow = await db
          .select()
          .from(schema.googleDriveTokens)
          .where(eq(schema.googleDriveTokens.userId, userId))
          .get()
        if (tokenRow) {
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
            } catch {
              // ignore refresh errors — sources are best-effort
            }
          }
          for (const docUrl of inputs.googleDocUrls) {
            if (seenSourceUrls.has(docUrl)) continue
            const fileId = extractFileId(docUrl)
            try {
              const fileName = await getDriveFileName(fileId, accessToken)
              sources.push({ url: docUrl, title: fileName })
            } catch {
              sources.push({ url: docUrl, title: fileId })
            }
            seenSourceUrls.add(docUrl)
          }
        } else {
          for (const docUrl of inputs.googleDocUrls) {
            if (seenSourceUrls.has(docUrl)) continue
            sources.push({ url: docUrl, title: extractFileId(docUrl) })
            seenSourceUrls.add(docUrl)
          }
        }
      }
    } else {
      fileUris = []

      await updatePhase(db, sessionId, "parsing")

      // ------------------------------------------------------------------
      // Step 1: Upload images to Gemini File API
      // ------------------------------------------------------------------
      if (inputs.imageFiles && inputs.imageFiles.length > 0) {
        fileUris = await Promise.all(
          inputs.imageFiles.map((img) =>
            uploadFileToGemini(img.buffer, img.mimeType, img.name, env.GEMINI_API_KEY).then(
              (uri) => ({ uri, mimeType: img.mimeType }),
            ),
          ),
        )
      } else {
        fileUris = await Promise.all(
          inputs.imageKeys.map(async (key) => {
            const obj = await env.BUCKET.get(key)
            if (!obj) throw new Error(`Uploaded image not found in R2: ${key}`)
            const mimeType = obj.httpMetadata?.contentType ?? "application/octet-stream"
            const name = key.split("/").at(-1) ?? key
            const buffer = await obj.arrayBuffer()
            const uri = await uploadFileToGemini(buffer, mimeType, name, env.GEMINI_API_KEY)
            return { uri, mimeType }
          }),
        )
      }

      // ------------------------------------------------------------------
      // Step 1b: Upload PDFs to Gemini File API
      // ------------------------------------------------------------------
      if (inputs.pdfFiles && inputs.pdfFiles.length > 0) {
        const pdfUris = await Promise.all(
          inputs.pdfFiles.map((pdf) =>
            uploadFileToGemini(pdf.buffer, pdf.mimeType, pdf.name, env.GEMINI_API_KEY).then(
              (uri) => ({ uri, mimeType: pdf.mimeType }),
            ),
          ),
        )
        fileUris.push(...pdfUris)
      } else if (inputs.pdfKeys && inputs.pdfKeys.length > 0) {
        const pdfUris = await Promise.all(
          inputs.pdfKeys.map(async (key) => {
            const obj = await env.BUCKET.get(key)
            if (!obj) throw new Error(`Uploaded PDF not found in R2: ${key}`)
            const buffer = await obj.arrayBuffer()
            const name = key.split("/").at(-1) ?? key
            const uri = await uploadFileToGemini(
              buffer,
              "application/pdf",
              name,
              env.GEMINI_API_KEY,
            )
            return { uri, mimeType: "application/pdf" }
          }),
        )
        fileUris.push(...pdfUris)
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

        // Collect source URL with display name (best-effort)
        try {
          const fileName = await getDriveFileName(fileId, accessToken)
          sources.push({ url: docUrl, title: fileName })
        } catch {
          sources.push({ url: docUrl, title: fileId })
        }

        // Primary: extract plain text (CSV for Sheets, plain text for Docs/Slides)
        const exportMime = isGoogleSheetsUrl(docUrl) ? "text/csv" : "text/plain"
        const docText = await exportFileAsText(fileId, accessToken, exportMime)
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
      // Step 2.4: Google Forms pre-processing (fetch structure + responses → stats)
      // ------------------------------------------------------------------

      if (inputs.googleFormUrl) {
        const formId = extractFormId(inputs.googleFormUrl)
        if (!formId) {
          throw new Error("Invalid Google Form URL")
        }

        // Use the same Google Drive token (which now includes forms.responses.readonly scope)
        const tokenRow = await db
          .select()
          .from(schema.googleDriveTokens)
          .where(eq(schema.googleDriveTokens.userId, userId))
          .get()

        if (!tokenRow) {
          throw new Error("Googleの認証が見つかりません。設定画面からGoogleを接続してください。")
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
              `Googleのアクセスが無効になりました。設定画面からGoogleを再接続してください。(${msg})`,
            )
          }
        }

        const formData = await fetchFormData(formId, accessToken)
        const stats = computeSurveyStats(formData)
        const statsText = formatSurveyStatsAsText(
          stats,
          inputs.eventTitle ?? formData.structure.title,
        )

        // Prepend structured stats to user text so Gemini uses pre-computed numbers
        docTexts.push(statsText)

        // Add form URL as a source
        sources.push({
          url: inputs.googleFormUrl,
          title: `Google Form: ${formData.structure.title}`,
        })

        // Skip Phase 0 (Clarifier) — form data is already structured
        skipPhase0 = true
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
    // Step 2.6: Fetch selected URLs as PDFs and upload to Gemini File API
    // ------------------------------------------------------------------
    if (
      isPostUrlSelection &&
      resumeContext?.selectedUrls &&
      resumeContext.selectedUrls.length > 0
    ) {
      await updatePhase(db, sessionId, "fetching_urls")

      // For each URL: try Browser Rendering PDF first, fall back to Jina on any failure.
      // env.BROWSER may be a non-functional stub in local dev, so we always fall back.
      const jinaParts: string[] = []
      for (const url of resumeContext.selectedUrls) {
        let uploadedPdf = false

        if (env.BROWSER) {
          console.log("[ingestion-pipeline] step 2.6: trying PDF for", url)
          const pdfResult = await fetchUrlAsPdf(env.BROWSER as unknown as BrowserWorker, url)
          if (pdfResult.error === undefined) {
            const hostname = new URL(url).hostname
            const geminiUri = await uploadFileToGemini(
              pdfResult.buffer,
              "application/pdf",
              hostname,
              env.GEMINI_API_KEY,
            )
            fileUris.push({ uri: geminiUri, mimeType: "application/pdf" })
            sources.push({ url, title: pdfResult.title || url })
            uploadedPdf = true
            console.log("[ingestion-pipeline] URL PDF uploaded:", url, "→", geminiUri)
          } else {
            console.warn(
              "[ingestion-pipeline] URL PDF failed, falling back to Jina:",
              url,
              pdfResult.error,
            )
          }
        }

        if (!uploadedPdf) {
          console.log("[ingestion-pipeline] step 2.6: fetching via Jina:", url)
          const jinaResult = await fetchUrlViaJina(url)
          if (jinaResult.error !== undefined) {
            console.warn("[ingestion-pipeline] URL Jina fetch failed:", url, jinaResult.error)
            jinaParts.push(`### ${url}\n(取得失敗: ${jinaResult.error})`)
            sources.push({ url, title: url })
          } else {
            console.log(
              "[ingestion-pipeline] URL Jina fetch ok:",
              url,
              `${jinaResult.markdown.length} chars`,
              jinaResult.truncated ? "(truncated)" : "",
            )
            const suffix = jinaResult.truncated ? "\n\n(... 10,000文字で切り詰めました)" : ""
            jinaParts.push(`### ${url}\n${jinaResult.markdown}${suffix}`)
            const titleMatch = jinaResult.markdown?.match(/^(?:Title:\s*(.+)|#\s+(.+))/m)
            const title = (titleMatch?.[1] ?? titleMatch?.[2])?.trim() || url
            sources.push({ url, title })
          }
        }
      }

      if (jinaParts.length > 0) {
        docTexts.push(`## 参考URL（ユーザーが選択した外部ページ）\n${jinaParts.join("\n\n")}`)
      }
    }

    // Build final user text (prepend clarification answers if resuming)
    const userText = buildUserText(baseUserText, docTexts)

    const effectiveUserText = isPostClarification
      ? `${resumeContext?.clarificationAnswers}\n\n${userText}`
      : userText

    console.log(
      "[ingestion-pipeline] effectiveUserText length:",
      effectiveUserText.length,
      "fileUris:",
      fileUris.length,
    )

    // ------------------------------------------------------------------
    // Phase 0: Clarifier (runs on first run OR after URL selection)
    // Page index (cheap D1 query) runs concurrently with Phase 0 Clarifier.
    // ------------------------------------------------------------------
    let pageIndex: PageIndexEntry[]

    if (!isPostClarification) {
      await updatePhase(db, sessionId, "planning")

      if (skipPhase0) {
        // Google Forms input — data is already structured, skip clarification
        pageIndex = await buildPageIndex(db, effectiveUserText)
      } else {
        const [pageIndexResult, clarifierResult] = await Promise.all([
          buildPageIndex(db, effectiveUserText),
          runPhase0Clarifier(env.GEMINI_API_KEY, effectiveUserText, fileUris, currentDatetime),
        ])

        if (clarifierResult.needsClarification) {
          const aiDraftJson: AiDraftJson = {
            phase: "clarification",
            questions: clarifierResult.questions,
            summary: clarifierResult.summary,
            fileUris,
            googleDocText: docTexts.join("\n\n---\n\n"),
            sources: sources.length > 0 ? sources : undefined,
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

        pageIndex = pageIndexResult
      }
    } else {
      await updatePhase(db, sessionId, "planning")
      pageIndex = await buildPageIndex(db, effectiveUserText)
    }

    // ------------------------------------------------------------------
    // Step 4: Phase 1 — Planner (merger logic is embedded in the prompt)
    // ------------------------------------------------------------------
    const plan = await runPhase1Planner(
      env.GEMINI_API_KEY,
      effectiveUserText,
      fileUris,
      pageIndex,
      currentDatetime,
    )

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

    // Derive image + PDF file names for AI hints
    const imageNames: string[] = [
      ...(inputs.imageFiles && inputs.imageFiles.length > 0
        ? inputs.imageFiles.map((f) => f.name)
        : inputs.imageKeys.map((k) => k.split("/").at(-1) ?? k)),
      ...(inputs.pdfFiles && inputs.pdfFiles.length > 0
        ? inputs.pdfFiles.map((f) => f.name)
        : (inputs.pdfKeys ?? []).map((k) => k.split("/").at(-1) ?? k)),
    ]

    const creatorResults = await Promise.all(
      createOps.map(async (op) => {
        const result = await runPhase2Creator(
          env.GEMINI_API_KEY,
          effectiveUserText,
          fileUris,
          op,
          pageIndex,
          createOps.filter((o) => o.tempId !== op.tempId),
          currentDatetime,
          imageNames,
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
          currentDatetime,
          imageNames,
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
      sources,
      imageKeys: inputs.imageKeys,
      pdfKeys: inputs.pdfKeys ?? [],
    }

    // ------------------------------------------------------------------
    // Step 8: Save to DB
    // ------------------------------------------------------------------
    console.log("[ingestion-pipeline] reached step 8 (saving) for session", sessionId)
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
    console.log(
      "[ingestion-pipeline] runIngestionPipeline completed successfully for session",
      sessionId,
    )
  } catch (err) {
    console.error(`[ingestion-pipeline] session=${sessionId} error:`, err)
    const rawMessage = err instanceof Error ? err.message : String(err)
    // Surface Google Drive / Forms / auth errors directly to the user
    const isGoogleApiError =
      /google\s*(drive|doc|form)|invalid_grant|invalid_token|refresh.?token|drive\.googleapis\.com|forms\.googleapis\.com|drive\s*api|forms\s*api|oauth|access.?token|UNAUTHENTICATED|認証|接続/i.test(
        rawMessage,
      ) ||
      rawMessage.includes("401") ||
      rawMessage.includes("403")
    const errorMessage = isGoogleApiError
      ? rawMessage
      : "Ingestion failed due to an internal error."
    const errorDb = drizzle(env.DB, { schema })
    try {
      await errorDb
        .update(schema.ingestionSessions)
        .set({
          status: "error",
          errorMessage,
          phaseMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.ingestionSessions.id, sessionId))
    } catch (dbErr) {
      console.error(
        `[ingestion-pipeline] failed to write error status for session=${sessionId}:`,
        dbErr,
      )
    }

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

export function generateSlug(title: string, englishHint?: string): string {
  const source = englishHint?.trim() || title
  return (
    source
      .toLowerCase()
      .replace(/[\s\u3000]+/g, "-")
      .replace(/[^\w-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || `page-${Date.now()}`
  )
}
