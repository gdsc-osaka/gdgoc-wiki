import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Form, Link, useFetcher } from "react-router"

interface NavbarProps {
  user: { name: string; email: string; image?: string | null; role: string } | null
}

function UiLangSwitcher() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const langFetcher = useFetcher()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function selectLang(lang: "ja" | "en") {
    i18n.changeLanguage(lang)
    localStorage.setItem("ui_lang", lang)
    langFetcher.submit({ lang }, { method: "post", action: "/api/set-ui-lang" })
    setOpen(false)
  }

  const current = i18n.language === "en" ? "en" : "ja"

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("language.switch_ui")}
        className="flex items-center gap-1 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        aria-label={t("language.switch_ui")}
      >
        <span className="text-base leading-none">🌐</span>
        <span className="text-xs font-medium uppercase">{current}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[7rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {(["ja", "en"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => selectLang(lang)}
              className={[
                "block w-full px-3 py-1.5 text-left text-sm",
                current === lang ? "font-semibold text-blue-600" : "text-gray-700 hover:bg-gray-50",
              ].join(" ")}
            >
              {t(`language.${lang}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Navbar({ user }: NavbarProps) {
  const { t } = useTranslation()
  const initial = user?.name?.[0]?.toUpperCase() ?? "?"
  const logoutFetcher = useFetcher()

  return (
    <header className="fixed top-0 right-0 left-0 z-50 flex h-14 items-center gap-4 border-b border-gray-200 bg-white px-4">
      {/* Logo */}
      <Link to="/" className="flex-shrink-0">
        <img src="/logo.png" alt="GDGoC Japan Wiki" className="h-8 w-auto" />
      </Link>

      {/* Search */}
      <Form action="/search" method="get" className="flex flex-1 justify-center">
        <input
          name="q"
          type="search"
          placeholder={`${t("nav.search")}…`}
          className="w-full max-w-[400px] rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </Form>

      {/* Right actions */}
      <div className="flex flex-shrink-0 items-center gap-3">
        {user && (
          <Link
            to="/ingest"
            className="rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-600"
          >
            + {t("nav.new_page")}
          </Link>
        )}

        <UiLangSwitcher />

        {user ? (
          <>
            <div
              className="flex h-8 w-8 select-none items-center justify-center overflow-hidden rounded-full bg-blue-500 text-sm font-medium text-white"
              title={user.name}
            >
              {user.image ? (
                <img src={user.image} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </div>
            <logoutFetcher.Form method="post" action="/logout">
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">
                {t("auth.sign_out")}
              </button>
            </logoutFetcher.Form>
          </>
        ) : (
          <Link to="/login" className="text-sm font-medium text-blue-500 hover:underline">
            {t("auth.sign_in")}
          </Link>
        )}
      </div>
    </header>
  )
}
