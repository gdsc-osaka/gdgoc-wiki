import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router"
import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router"
import { type SupportedLng, supportedLngs } from "./i18n"
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
  // Prefer the persisted ui_lang cookie so SSR language matches the user's
  // saved preference, falling back to Accept-Language detection.
  const cookieHeader = request.headers.get("Cookie") ?? ""
  const cookieLang = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("ui_lang="))
    ?.split("=")[1]
  const detected = await i18nextServer.getLocale(request)
  const locale: SupportedLng =
    cookieLang && (supportedLngs as readonly string[]).includes(cookieLang)
      ? (cookieLang as SupportedLng)
      : (detected as SupportedLng)
  const cookieTheme = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("theme="))
    ?.split("=")[1]
  const theme = cookieTheme === "dark" ? "dark" : "light"
  const origin = new URL(request.url).origin
  return { locale, theme, origin }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { property: "og:site_name", content: "GDGoC Japan Wiki" },
  { property: "og:image", content: `${data?.origin ?? ""}/og-image.png` },
  { property: "og:type", content: "website" },
  { name: "twitter:card", content: "summary_large_image" },
]

export default function App() {
  const { locale, theme } = useLoaderData<typeof loader>()

  return (
    <html lang={locale} className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script src="/theme-init.js" />
        <Meta />
        <Links />
      </head>
      <body className="bg-gray-50 text-gray-900">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}
