import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { createRequestHandler } from "react-router"
import * as schema from "../app/db/schema"
import { runTranslation } from "../app/lib/gemini.server"

// The server build is a virtual module provided by @react-router/dev/vite at build time.
const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env?.MODE ?? "production",
)

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    })
  },

  // Queue consumer for background translation jobs.
  // Messages are enqueued by the commit action after a page is published.
  async queue(batch: MessageBatch<unknown>, env: Env, _ctx: ExecutionContext): Promise<void> {
    const db = drizzle(env.DB, { schema })

    for (const message of batch.messages) {
      try {
        const body = message.body
        if (
          typeof body !== "object" ||
          body === null ||
          typeof (body as Record<string, unknown>).pageId !== "string"
        ) {
          console.warn("translation-jobs: invalid message body, dropping", message.id)
          message.ack()
          continue
        }
        const { pageId } = body as { pageId: string }
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
      } catch (err) {
        console.error("translation-jobs: failed to process message", message.id, err)
        message.retry()
      }
    }
  },
} satisfies ExportedHandler<Env>
