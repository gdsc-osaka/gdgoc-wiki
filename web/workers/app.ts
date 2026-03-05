import { drizzle } from "drizzle-orm/d1"
import { createRequestHandler } from "react-router"
import * as schema from "../app/db/schema"
import { createAuth } from "../app/lib/auth.server"
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

/**
 * Lazy singleton that pre-warms better-auth's AsyncLocalStorage instances exactly
 * once per Worker isolate.  The assignment is synchronous, so even if two requests
 * arrive simultaneously the second one gets the same Promise — not a new one.
 *
 * Why this is necessary: better-auth lazily initialises three separate ALS instances
 * (requestState, adapterState, endpointContext) using an async check-and-set pattern.
 * If two requests race through that initialisation before the first one stores the
 * ALS, the second overwrites it.  Request A then calls als_A.run() while
 * getCurrentRequestState() looks up the overwritten als_B, finds nothing, and throws
 * "No request state found."
 */
let _authWarmupPromise: Promise<void> | null = null

function warmupAuth(env: Env): Promise<void> {
  if (!_authWarmupPromise) {
    _authWarmupPromise = createAuth(env)
      .api.getSession({ headers: new Headers() })
      .then(() => undefined)
      .catch(() => undefined)
  }
  return _authWarmupPromise
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    await warmupAuth(env)
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
