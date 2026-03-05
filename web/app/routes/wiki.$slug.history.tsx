import { eq } from "drizzle-orm"
import { MdPreview } from "md-editor-rt"
import "md-editor-rt/lib/preview.css"
import { History } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { LoaderFunctionArgs, MetaFunction } from "react-router"
import { Link, useLoaderData } from "react-router"
import * as schema from "~/db/schema"
import { useThemeMode } from "~/hooks/useThemeMode"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"
import { canUserSeePage } from "~/lib/page-visibility.server"
import { tiptapToMarkdown } from "~/lib/tiptap-convert"

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data
      ? `History: ${data.page.titleEn || data.page.titleJa} — GDGoC Japan Wiki`
      : "Page history",
  },
]

type VersionRow = {
  id: string
  titleJa: string
  titleEn: string
  editedBy: string
  savedAt: number
  editorName: string | null
}

type VersionRaw = {
  id: string
  title_ja: string
  title_en: string
  edited_by: string
  saved_at: number
  editor_name: string | null
}

type VersionFullRaw = VersionRaw & {
  content_ja: string
  content_en: string
}

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  const sessionUser = await requireRole(request, env, "viewer")
  const db = getDb(env)

  const page = await db
    .select({
      id: schema.pages.id,
      titleJa: schema.pages.titleJa,
      titleEn: schema.pages.titleEn,
      slug: schema.pages.slug,
      status: schema.pages.status,
      visibility: schema.pages.visibility,
      chapterId: schema.pages.chapterId,
      authorId: schema.pages.authorId,
    })
    .from(schema.pages)
    .where(eq(schema.pages.slug, params.slug ?? ""))
    .get()

  if (!page || page.status !== "published") {
    throw new Response("Not Found", { status: 404 })
  }

  if (!canUserSeePage(sessionUser, page)) {
    throw new Response("Not Found", { status: 404 })
  }

  const versionsResult = (await env.DB.prepare(
    `SELECT pv.id, pv.title_ja, pv.title_en, pv.edited_by, pv.saved_at,
            u.name AS editor_name
     FROM page_versions pv
     LEFT JOIN user u ON pv.edited_by = u.id
     WHERE pv.page_id = ?
     ORDER BY pv.saved_at DESC
     LIMIT 10`,
  )
    .bind(page.id)
    .all()) as { results: VersionRaw[] }

  const versions: VersionRow[] = (versionsResult.results ?? []).map((r) => ({
    id: r.id,
    titleJa: r.title_ja,
    titleEn: r.title_en,
    editedBy: r.edited_by,
    savedAt: r.saved_at,
    editorName: r.editor_name,
  }))

  const url = new URL(request.url)
  const langParam = url.searchParams.get("lang")
  const lang: "ja" | "en" = langParam === "ja" || langParam === "en" ? langParam : "ja"
  const versionId = url.searchParams.get("v")

  let selectedVersion: {
    id: string
    titleJa: string
    titleEn: string
    contentJa: string
    contentEn: string
    savedAt: number
    editorName: string | null
  } | null = null

  if (versionId) {
    const vRow = (await env.DB.prepare(
      `SELECT pv.id, pv.title_ja, pv.title_en, pv.content_ja, pv.content_en, pv.saved_at,
              u.name AS editor_name
       FROM page_versions pv
       LEFT JOIN user u ON pv.edited_by = u.id
       WHERE pv.id = ? AND pv.page_id = ?`,
    )
      .bind(versionId, page.id)
      .first()) as VersionFullRaw | null

    if (vRow) {
      selectedVersion = {
        id: vRow.id,
        titleJa: vRow.title_ja,
        titleEn: vRow.title_en,
        contentJa: tiptapToMarkdown(vRow.content_ja ?? ""),
        contentEn: tiptapToMarkdown(vRow.content_en ?? ""),
        savedAt: vRow.saved_at,
        editorName: vRow.editor_name,
      }
    }
  }

  return {
    page: { slug: page.slug, titleJa: page.titleJa, titleEn: page.titleEn },
    versions,
    selectedVersion,
    lang,
  }
}

function relativeTimeDiff(savedAt: number): { key: string; count?: number } {
  const diffMs = Date.now() - savedAt * 1000
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return { key: "time.just_now" }
  if (diffMins < 60) return { key: "time.minutes_ago", count: diffMins }
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return { key: "time.hours_ago", count: diffHours }
  return { key: "time.days_ago", count: Math.floor(diffHours / 24) }
}

export default function WikiHistory() {
  const { page, versions, selectedVersion, lang } = useLoaderData<typeof loader>()
  const { t } = useTranslation("common")
  const theme = useThemeMode()

  const pageTitle = lang === "en" ? page.titleEn || page.titleJa : page.titleJa || page.titleEn

  const versionUrl = (vId: string, l = lang) => {
    const p = new URLSearchParams({ lang: l, v: vId })
    return `/wiki/${page.slug}/history?${p}`
  }

  const langUrl = (l: string) => {
    const p = new URLSearchParams({ lang: l })
    if (selectedVersion) p.set("v", selectedVersion.id)
    return `/wiki/${page.slug}/history?${p}`
  }

  const displayTitle = selectedVersion
    ? lang === "en"
      ? selectedVersion.titleEn || selectedVersion.titleJa
      : selectedVersion.titleJa || selectedVersion.titleEn
    : null

  const displayContent = selectedVersion
    ? lang === "en"
      ? selectedVersion.contentEn || selectedVersion.contentJa
      : selectedVersion.contentJa || selectedVersion.contentEn
    : null

  return (
    <div className="flex min-h-full flex-col">
      {/* Mini-header */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2 md:px-10">
        <Link to={`/wiki/${page.slug}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← {pageTitle}
        </Link>
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-600">
          <History size={14} />
          {t("wiki.history")}
        </div>
      </div>

      <div className="flex flex-1 gap-0 px-4 py-4 md:px-10 md:py-6">
        {/* Left: version list */}
        <aside className="mr-6 w-56 shrink-0 border-r border-gray-100 pr-4">
          {versions.length === 0 ? (
            <p className="text-sm text-gray-400">{t("wiki.history_empty")}</p>
          ) : (
            <ul className="space-y-1">
              {/* "Current" entry linking back to live page */}
              <li>
                <Link
                  to={`/wiki/${page.slug}`}
                  className="block rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                >
                  <div className="font-medium text-gray-700">{t("wiki.history_current")}</div>
                  <div className="truncate text-xs text-gray-400">{pageTitle}</div>
                </Link>
              </li>

              {versions.map((v) => {
                const isActive = selectedVersion?.id === v.id
                const rt = relativeTimeDiff(v.savedAt)
                const timeStr = rt.count !== undefined ? t(rt.key, { count: rt.count }) : t(rt.key)
                return (
                  <li key={v.id}>
                    <Link
                      to={versionUrl(v.id)}
                      className={[
                        "block rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "border-l-2 border-blue-500 bg-blue-50 text-blue-700"
                          : "text-gray-600 hover:bg-gray-50",
                      ].join(" ")}
                    >
                      <div className="truncate font-medium">
                        {lang === "en" ? v.titleEn || v.titleJa : v.titleJa || v.titleEn}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        {v.editorName ?? v.editedBy.slice(0, 8)}
                        {" · "}
                        {timeStr}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {/* Right: content preview */}
        <div className="min-w-0 flex-1">
          {/* Language tabs */}
          <div className="mb-4 flex w-fit shrink-0 gap-1 rounded-md border border-gray-200 bg-white p-0.5">
            {(["ja", "en"] as const).map((l) => {
              const isActive = lang === l
              return (
                <Link
                  key={l}
                  to={langUrl(l)}
                  className={[
                    "min-w-10 rounded px-2 py-1 text-center text-sm font-medium transition-colors",
                    isActive ? "bg-blue-500 text-white" : "text-gray-600 hover:bg-gray-100",
                  ].join(" ")}
                >
                  {l === "ja" ? "JA" : "EN"}
                </Link>
              )
            })}
          </div>

          {selectedVersion ? (
            <>
              <h1 className="mb-4 text-2xl font-bold text-gray-900">{displayTitle}</h1>
              {displayContent ? (
                <MdPreview
                  modelValue={displayContent}
                  theme={theme}
                  autoFoldThreshold={Number.POSITIVE_INFINITY}
                />
              ) : (
                <p className="text-gray-400">No content available.</p>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <History size={32} className="mb-3 opacity-30" />
              <p className="text-sm">{t("wiki.history_empty")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
