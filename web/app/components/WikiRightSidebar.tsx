import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useFetcher, useLocation } from "react-router"
import type { TocItem } from "~/components/TipTapRenderer"

interface Tag {
  tagSlug: string
  labelJa: string
  labelEn: string
  color: string
}

interface Author {
  id: string
  name: string
  image: string | null
}

interface Editor {
  id: string
  name: string
}

interface WikiRightSidebarProps {
  tocItems: TocItem[]
  author: Author | null
  editor: Editor | null
  updatedAt: Date | string | number | null
  tags: Tag[]
  lang: "ja" | "en"
  translationStatusJa: string
  translationStatusEn: string
  slug: string
  canEdit: boolean
  visibility: string
  canChangeVisibility: boolean
}

const VISIBILITY_OPTIONS = [
  { value: "public" },
  { value: "private_to_chapter" },
  { value: "private_to_lead" },
] as const

const VISIBILITY_KEYS: Record<string, string> = {
  public: "wiki.visibility_public",
  private_to_chapter: "wiki.visibility_chapter",
  private_to_lead: "wiki.visibility_lead",
}

function timeAgo(date: Date, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return t("time.just_now")
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t("time.minutes_ago", { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t("time.hours_ago", { count: hours })
  const days = Math.floor(hours / 24)
  return t("time.days_ago", { count: days })
}

export default function WikiRightSidebar({
  tocItems,
  author,
  editor,
  updatedAt,
  tags,
  lang,
  translationStatusJa,
  translationStatusEn,
  slug,
  canEdit,
  visibility,
  canChangeVisibility,
}: WikiRightSidebarProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const { t } = useTranslation()
  const location = useLocation()
  const visibilityFetcher = useFetcher()
  const jaUrl = `${location.pathname}?lang=ja`
  const enUrl = `${location.pathname}?lang=en`
  const translationStatus = lang === "en" ? translationStatusEn : translationStatusJa

  useEffect(() => {
    if (!tocItems.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: "0% 0% -80% 0%", threshold: 0 },
    )
    for (const item of tocItems) {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [tocItems])

  return (
    <aside className="sticky top-14 w-56 flex-shrink-0 self-start overflow-y-auto px-4 py-8">
      {/* Language Toggle */}
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t("wiki.read_in")}
        </p>
        <div className="flex gap-1">
          {(["ja", "en"] as const).map((l) => {
            const status = l === "ja" ? translationStatusJa : translationStatusEn
            const isPending = status === "missing"
            const isActive = lang === l
            return (
              <Link
                key={l}
                to={l === "ja" ? jaUrl : enUrl}
                aria-disabled={isPending}
                title={isPending ? t("wiki.translation_pending") : undefined}
                className={[
                  "flex-1 rounded px-2 py-1 text-center text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-500 text-white"
                    : isPending
                      ? "pointer-events-none text-gray-300"
                      : "text-gray-600 hover:bg-gray-100",
                ].join(" ")}
              >
                {l === "ja" ? "JA" : "EN"}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Table of Contents */}
      {tocItems.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {t("wiki.on_this_page")}
          </p>
          <nav aria-label="Table of contents">
            <ul className="space-y-1">
              {tocItems.map((item) => (
                <li key={item.id} style={{ paddingLeft: item.level === 3 ? "0.75rem" : undefined }}>
                  <a
                    href={`#${item.id}`}
                    className={[
                      "block truncate text-sm transition-colors",
                      activeId === item.id
                        ? "font-medium text-blue-600"
                        : "text-gray-500 hover:text-gray-900",
                    ].join(" ")}
                  >
                    {item.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}

      {/* Metadata */}
      <div className="space-y-4">
        {/* Author */}
        {author && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("wiki.author")}
            </p>
            <div className="flex items-center gap-2">
              {author.image ? (
                <img
                  src={author.image}
                  alt={author.name}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                  {author.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="text-sm text-gray-700">{author.name}</span>
            </div>
          </div>
        )}

        {/* Last edited */}
        {updatedAt && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("wiki.last_edited_by")}
            </p>
            <p className="text-xs text-gray-500">
              {editor ? `${editor.name}, ` : ""}
              {timeAgo(new Date(updatedAt as string), t)}
            </p>
          </div>
        )}

        {/* Translation status */}
        {translationStatus === "ai" && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {t("wiki.auto_translated")}
          </span>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("wiki.tags")}
            </p>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag.tagSlug}
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {lang === "en" ? tag.labelEn : tag.labelJa}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Visibility */}
        {canChangeVisibility && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("wiki.visibility")}
            </p>
            <select
              value={(visibilityFetcher.formData?.get("visibility") as string) ?? visibility}
              onChange={(e) => {
                visibilityFetcher.submit(
                  { intent: "setVisibility", visibility: e.target.value },
                  { method: "post", action: `/wiki/${slug}` },
                )
              }}
              className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700"
            >
              {VISIBILITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(VISIBILITY_KEYS[opt.value])}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Edit button */}
        {canEdit && (
          <div className="pt-2">
            <Link
              to={`/wiki/${slug}/edit`}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-500"
            >
              <span>✎</span>
              <span>{t("wiki.edit_page")}</span>
            </Link>
          </div>
        )}
      </div>
    </aside>
  )
}
