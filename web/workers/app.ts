import { createRequestHandler } from "react-router"

// The server build is a virtual module provided by @react-router/dev/vite at build time.
const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
)

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    })
  },

  // Queue consumer for background translation jobs.
  // Messages are enqueued by the TRANSLATION_QUEUE producer binding.
  // TODO: implement translation processing logic here.
  async queue(batch: MessageBatch<unknown>, _env: Env, _ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      console.log("translation-jobs: received message", message.id)
      message.ack()
    }
  },
} satisfies ExportedHandler<Env>
