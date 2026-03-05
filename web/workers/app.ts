import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { createRequestHandler } from "react-router"
import * as schema from "../app/db/schema"
import { runTranslation } from "../app/lib/gemini.server"
import { isIngestionQueueMessage, parseSessionInputsJson } from "../app/lib/ingestion-jobs.server"
import type { AiDraftJson, IngestionInputs } from "../app/lib/ingestion-pipeline.server"
import { runIngestionPipeline } from "../app/lib/ingestion-pipeline.server"

// The server build is a virtual module provided by @react-router/dev/vite at build time.
const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env?.MODE ?? "production",
)

function isTranslationQueueMessage(body: unknown): body is { pageId: string } {
  if (typeof body !== "object" || body === null) return false
  return typeof (body as Record<string, unknown>).pageId === "string"
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    })
  },

  // Queue consumer for background translation and ingestion jobs.
  async queue(batch: MessageBatch<unknown>, env: Env, _ctx: ExecutionContext): Promise<void> {
    const db = drizzle(env.DB, { schema })

    for (const message of batch.messages) {
      try {
        const body = message.body
        if (isIngestionQueueMessage(body)) {
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
            message.ack()
            continue
          }

          if (session.userId !== body.userId) {
            console.warn("ingestion-jobs: session user mismatch, dropping", body.sessionId)
            message.ack()
            continue
          }

          if (session.status !== "processing") {
            console.log("ingestion-jobs: session is not processing, skipping", body.sessionId)
            message.ack()
            continue
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
            message.ack()
            continue
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
              message.ack()
              continue
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
              message.ack()
              continue
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
          message.ack()
          continue
        }

        if (isTranslationQueueMessage(body)) {
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
            message.ack()
            continue
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
          message.ack()
          continue
        }

        console.warn("queue: invalid message body, dropping", message.id)
        message.ack()
      } catch (err) {
        console.error("queue: failed to process message", message.id, err)
        message.retry()
      }
    }
  },
} satisfies ExportedHandler<Env>
