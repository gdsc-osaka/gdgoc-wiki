import { LogOut, Settings } from "lucide-react"
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

function UserMenu({ user }: { user: NonNullable<NavbarProps["user"]> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const logoutFetcher = useFetcher()
  const initial = user.name[0]?.toUpperCase() ?? "?"

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex h-8 w-8 select-none items-center justify-center overflow-hidden rounded-full bg-blue-500 text-sm font-medium text-white hover:ring-2 hover:ring-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
        title={user.name}
      >
        {user.image ? (
          <img src={user.image} alt={user.name} className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[14rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {/* Identity header */}
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-500 text-sm font-medium text-white">
              {user.image ? (
                <img src={user.image} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            </div>
          </div>

          <div className="my-1 border-t border-gray-100" />

          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Settings className="h-4 w-4 text-gray-400" aria-hidden="true" />
            {t("settings.title")}
          </Link>

          <div className="my-1 border-t border-gray-100" />

          <logoutFetcher.Form method="post" action="/logout">
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4 text-gray-400" aria-hidden="true" />
              {t("auth.sign_out")}
            </button>
          </logoutFetcher.Form>
        </div>
      )}
    </div>
  )
}

export default function Navbar({ user }: NavbarProps) {
  const { t } = useTranslation()

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

        <a
          href="https://github.com/gdsc-osaka/gdgoc-wiki"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <span className="sr-only">{t("nav.github")}</span>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.603-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
          </svg>
        </a>

        <UiLangSwitcher />

        {user ? (
          <UserMenu user={user} />
        ) : (
          <Link to="/login" className="text-sm font-medium text-blue-500 hover:underline">
            {t("auth.sign_in")}
          </Link>
        )}
      </div>
    </header>
  )
}
