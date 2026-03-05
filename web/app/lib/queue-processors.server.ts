import { eq } from "drizzle-orm"
import type { drizzle } from "drizzle-orm/d1"
import * as schema from "~/db/schema"
import { runTranslation } from "./gemini.server"
import type { IngestionQueueMessage } from "./ingestion-jobs.server"
import { parseSessionInputsJson } from "./ingestion-jobs.server"
import type { AiDraftJson, IngestionInputs } from "./ingestion-pipeline.server"
import { runIngestionPipeline } from "./ingestion-pipeline.server"

type Db = ReturnType<typeof drizzle>

function isTranslationQueueMessage(body: unknown): body is { pageId: string } {
  if (typeof body !== "object" || body === null) return false
  return typeof (body as Record<string, unknown>).pageId === "string"
}

export function isTranslationQueueBody(body: unknown): body is { pageId: string } {
  return isTranslationQueueMessage(body)
}

export async function processIngestionMessage(
  env: Env,
  db: Db,
  body: IngestionQueueMessage,
): Promise<void> {
  const session = await db
    .select({
      id: schema.ingestionSessions.id,
      userId: schema.ingestionSessions.userId,
      status: schema.ingestionSessions.status,
      inputsJson: schema.ingestionSessions.inputsJson,
      aiDraftJson: schema.ingestionSessions.aiDraftJson,
    })
    .from(schema.ingestionSessions)
    .where(eq(schema.ingestionSessions.id, body.sessionId))
    .get()

  if (!session) {
    console.warn("ingestion-jobs: session not found, dropping", body.sessionId)
    return
  }

  if (session.userId !== body.userId) {
    console.warn("ingestion-jobs: session user mismatch, dropping", body.sessionId)
    return
  }

  if (session.status !== "processing") {
    console.log("ingestion-jobs: session is not processing, skipping", body.sessionId)
    return
  }

  let inputs: IngestionInputs
  try {
    inputs = parseSessionInputsJson(session.inputsJson)
  } catch {
    await db
      .update(schema.ingestionSessions)
      .set({
        status: "error",
        errorMessage: "Ingestion session inputs are invalid.",
        phaseMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.ingestionSessions.id, session.id))
    return
  }

  let resumeContext:
    | {
        fileUris: { uri: string; mimeType: string }[]
        clarificationAnswers: string
        googleDocText?: string
        selectedUrls?: string[]
        fetchedUrlContent?: string
      }
    | undefined

  if (body.resumeMode === "post_clarification") {
    let draft: AiDraftJson | null = null
    try {
      draft = session.aiDraftJson ? (JSON.parse(session.aiDraftJson) as AiDraftJson) : null
    } catch {
      draft = null
    }
    if (!draft || draft.phase !== "resume_post_clarification") {
      await db
        .update(schema.ingestionSessions)
        .set({
          status: "error",
          errorMessage: "Ingestion resume context is invalid.",
          phaseMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.ingestionSessions.id, session.id))
      return
    }
    resumeContext = {
      fileUris: draft.fileUris,
      clarificationAnswers: draft.clarificationAnswers,
      googleDocText: draft.googleDocText,
      fetchedUrlContent: draft.fetchedUrlContent,
    }
  } else if (body.resumeMode === "post_url_selection") {
    let draft: AiDraftJson | null = null
    try {
      draft = session.aiDraftJson ? (JSON.parse(session.aiDraftJson) as AiDraftJson) : null
    } catch {
      draft = null
    }
    if (!draft || draft.phase !== "resume_post_url_selection") {
      await db
        .update(schema.ingestionSessions)
        .set({
          status: "error",
          errorMessage: "Ingestion resume context is invalid.",
          phaseMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.ingestionSessions.id, session.id))
      return
    }
    resumeContext = {
      fileUris: draft.fileUris,
      clarificationAnswers: "",
      googleDocText: draft.googleDocText,
      selectedUrls: draft.selectedUrls,
    }
  }

  console.log("ingestion-jobs: processing session", session.id, body.resumeMode)
  await runIngestionPipeline(env, session.id, session.userId, inputs, resumeContext)
}

export async function processTranslationMessage(
  env: Env,
  db: Db,
  body: { pageId: string },
): Promise<void> {
  const { pageId } = body
  console.log("translation-jobs: processing page", pageId)

  const page = await db
    .select({
      contentJa: schema.pages.contentJa,
      titleJa: schema.pages.titleJa,
      summaryJa: schema.pages.summaryJa,
    })
    .from(schema.pages)
    .where(eq(schema.pages.id, pageId))
    .get()

  if (!page) {
    console.warn("translation-jobs: page not found", pageId)
    return
  }

  const { contentEn, titleEn, summaryEn } = await runTranslation(
    env.GEMINI_API_KEY,
    page.contentJa,
    page.titleJa,
    page.summaryJa,
  )

  await db
    .update(schema.pages)
    .set({
      contentEn,
      titleEn,
      summaryEn,
      translationStatusEn: "ai",
      updatedAt: new Date(),
    })
    .where(eq(schema.pages.id, pageId))

  console.log("translation-jobs: done", pageId)
}
