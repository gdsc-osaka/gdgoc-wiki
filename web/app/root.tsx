import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router"
import type { LinksFunction } from "react-router"

import appStylesHref from "./app.css?url"

export const links: LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
  {
    rel: "preconnect",
    href: "https://fonts.googleapis.com",
  },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100..900&display=swap",
  },
  { rel: "stylesheet", href: appStylesHref },
]

export default function App() {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}
