import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router"
import type { LinksFunction, LoaderFunctionArgs } from "react-router"
import { i18nextServer } from "./i18n.server"

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

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = await i18nextServer.getLocale(request)
  return { locale }
}

export default function App() {
  const { locale } = useLoaderData<typeof loader>()

  return (
    <html lang={locale}>
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
