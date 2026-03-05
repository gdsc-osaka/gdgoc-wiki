import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useBlocker, useFetcher } from "react-router"
import TipTapEditor from "~/components/TipTapEditor"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Page {
  id: string
  titleJa: string
  titleEn: string
  slug: string
  status: string
  contentJa: string
  contentEn: string
}

interface PageEditorProps {
  page: Page
  canPublish: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTipTapJson(content: string | null | undefined): boolean {
  return typeof content === "string" && content.startsWith('{"type":"doc"')
}

function formatRelativeTime(
  isoString: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return t("time.just_now")
  if (minutes < 60) return t("time.minutes_ago", { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t("time.hours_ago", { count: hours })
  const days = Math.floor(hours / 24)
  return t("time.days_ago", { count: days })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PageEditor({ page, canPublish }: PageEditorProps) {
  const { t } = useTranslation()
  const fetcher = useFetcher<{ ok: boolean; savedAt: string }>()

  const [titleJa, setTitleJa] = useState(page.titleJa)
  const [titleEn, setTitleEn] = useState(page.titleEn)
  const [contentJa, setContentJa] = useState(page.contentJa)
  const [contentEn, setContentEn] = useState(page.contentEn)
  const [activeLang, setActiveLang] = useState<"ja" | "en">("ja")
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

  // Track last saved content to detect dirty state
  const lastSavedRef = useRef({
    titleJa: page.titleJa,
    titleEn: page.titleEn,
    contentJa: page.contentJa,
    contentEn: page.contentEn,
  })

  // Snapshot of the payload that was actually submitted — updated at submit time,
  // not at response time, so concurrent edits don't incorrectly clear dirty state.
  const pendingSaveRef = useRef<typeof lastSavedRef.current | null>(null)

  const isDirty =
    titleJa !== lastSavedRef.current.titleJa ||
    titleEn !== lastSavedRef.current.titleEn ||
    contentJa !== lastSavedRef.current.contentJa ||
    contentEn !== lastSavedRef.current.contentEn

  // Update lastSavedAt when autosave succeeds — use the submitted snapshot
  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data.savedAt && pendingSaveRef.current) {
      setLastSavedAt(fetcher.data.savedAt)
      lastSavedRef.current = pendingSaveRef.current
      pendingSaveRef.current = null
    }
  }, [fetcher.data])

  // Auto-save every 30s when dirty
  const submitAutosave = useCallback(() => {
    if (!isDirty) return
    const snapshot = { titleJa, titleEn, contentJa, contentEn }
    pendingSaveRef.current = snapshot
    const fd = new FormData()
    fd.set("intent", "autosave")
    fd.set("titleJa", titleJa)
    fd.set("titleEn", titleEn)
    fd.set("contentJa", contentJa)
    fd.set("contentEn", contentEn)
    fetcher.submit(fd, { method: "post" })
  }, [isDirty, titleJa, titleEn, contentJa, contentEn, fetcher])

  useEffect(() => {
    const id = setInterval(submitAutosave, 30_000)
    return () => clearInterval(id)
  }, [submitAutosave])

  // Navigation guard when dirty
  useBlocker(() => isDirty && fetcher.state === "idle")

  // Autosave status text
  let statusText: string | null = null
  if (fetcher.state !== "idle") {
    statusText = t("editor.saving")
  } else if (fetcher.data && !fetcher.data.ok) {
    statusText = t("editor.autosave_failed")
  } else if (lastSavedAt) {
    statusText = t("editor.saved_at", { time: formatRelativeTime(lastSavedAt, t) })
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <Link to={`/wiki/${page.slug}`} className="text-sm text-blue-600 hover:underline">
          ← {t("editor.back_to_page")}
        </Link>
        {page.status === "draft" && (
          <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-800">
            Draft
          </span>
        )}
      </div>

      {/* Auto-save status bar */}
      {statusText && (
        <div
          className={`mb-4 rounded-md px-3 py-2 text-sm ${
            fetcher.data && !fetcher.data.ok
              ? "bg-red-50 text-red-700"
              : "bg-green-50 text-green-700"
          }`}
        >
          {statusText}
        </div>
      )}

      <fetcher.Form method="post">
        {/* Hidden content fields — always kept in sync */}
        <input type="hidden" name="contentJa" value={contentJa} />
        <input type="hidden" name="contentEn" value={contentEn} />

        {/* Title inputs */}
        <div className="mb-6 space-y-3">
          <div>
            <label htmlFor="titleJa" className="mb-1 block text-sm font-medium text-gray-700">
              {t("editor.title_ja")} *
            </label>
            <input
              id="titleJa"
              type="text"
              name="titleJa"
              value={titleJa}
              onChange={(e) => setTitleJa(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="titleEn" className="mb-1 block text-sm font-medium text-gray-700">
              {t("editor.title_en")}
            </label>
            <input
              id="titleEn"
              type="text"
              name="titleEn"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Language tabs */}
        <div className="mb-2 flex gap-2">
          {(["ja", "en"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setActiveLang(lang)}
              className={`rounded-t-lg border px-4 py-2 text-sm font-medium transition-colors ${
                activeLang === lang
                  ? "border-b-white bg-white text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {lang === "ja" ? t("language.ja") : t("language.en")}
            </button>
          ))}
        </div>

        {/* TipTap editors — both always mounted, toggled via CSS */}
        <div className={activeLang === "ja" ? "" : "hidden"}>
          <TipTapEditor
            initialJson={isTipTapJson(page.contentJa) ? page.contentJa : undefined}
            initialMarkdown={isTipTapJson(page.contentJa) ? undefined : page.contentJa}
            onChange={setContentJa}
          />
        </div>
        <div className={activeLang === "en" ? "" : "hidden"}>
          <TipTapEditor
            initialJson={isTipTapJson(page.contentEn) ? page.contentEn : undefined}
            initialMarkdown={isTipTapJson(page.contentEn) ? undefined : page.contentEn}
            onChange={setContentEn}
          />
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 mt-6 flex justify-end gap-3 border-t border-gray-200 bg-white pt-4 pb-4">
          <button
            type="submit"
            name="intent"
            value="save"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {t("editor.save_draft")}
          </button>
          {canPublish && (
            <button
              type="submit"
              name="intent"
              value="publish"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {t("editor.publish")} ↗
            </button>
          )}
        </div>
      </fetcher.Form>
    </div>
  )
}
