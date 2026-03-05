import type { LoaderFunctionArgs } from "react-router"

export async function loader({ request: _request, context, params }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  const key = params["*"] ?? ""

  // Security: only allow keys starting with wiki/ or ingestion/
  if (!key.startsWith("wiki/") && !key.startsWith("ingestion/")) {
    return new Response("Not Found", { status: 404 })
  }

  const obj = await env.BUCKET.get(key)
  if (!obj) {
    return new Response("Not Found", { status: 404 })
  }

  const contentType = obj.httpMetadata?.contentType ?? "application/octet-stream"
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
  })

  return new Response(obj.body, { headers })
}
