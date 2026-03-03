import { renderToReadableStream } from "react-dom/server"
import type { AppLoadContext, EntryContext } from "react-router"
import { ServerRouter } from "react-router"

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  let statusCode = responseStatusCode
  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} />,
    {
      signal: request.signal,
      onError(error: unknown) {
        console.error(error)
        statusCode = 500
      },
    },
  )

  responseHeaders.set("Content-Type", "text/html")

  return new Response(body, {
    headers: responseHeaders,
    status: statusCode,
  })
}
