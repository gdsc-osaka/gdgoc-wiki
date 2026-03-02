import { createRequestHandler } from "react-router"

// The server build is a virtual module provided by @react-router/dev/vite at build time.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - virtual module
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
} satisfies ExportedHandler<Env>
