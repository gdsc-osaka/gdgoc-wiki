import { drizzle } from "drizzle-orm/d1"
import { createRequestHandler } from "react-router"
import * as schema from "../app/db/schema"
import { isIngestionQueueMessage } from "../app/lib/ingestion-jobs.server"
import {
  isTranslationQueueBody,
  processIngestionMessage,
  processTranslationMessage,
} from "../app/lib/queue-processors.server"

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

  // Queue consumer for background translation and ingestion jobs.
  async queue(batch: MessageBatch<unknown>, env: Env, _ctx: ExecutionContext): Promise<void> {
    const db = drizzle(env.DB, { schema })

    for (const message of batch.messages) {
      try {
        const body = message.body
        if (isIngestionQueueMessage(body)) {
          await processIngestionMessage(env, db, body)
          message.ack()
          continue
        }

        if (isTranslationQueueBody(body)) {
          await processTranslationMessage(env, db, body)
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
