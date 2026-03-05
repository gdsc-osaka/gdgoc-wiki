import { and, eq, inArray, sql } from "drizzle-orm"
import { useTranslation } from "react-i18next"
import { Link, useLoaderData } from "react-router"
import type { LoaderFunctionArgs, MetaFunction } from "react-router"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"
import { buildVisibilityFilter } from "~/lib/page-visibility.server"

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.q ? `"${data.q}" — Search — GDGoC Japan Wiki` : "Search — GDGoC Japan Wiki" },
]

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/** Strip FTS5 special operators to prevent query injection */
function sanitizeFtsQuery(raw: string): string {
  return raw.replace(/[*"():^{}~<>|]/g, "").trim()
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const q = url.searchParams.get("q")?.trim() ?? ""

  if (!q) return { q: "", results: [] }

  const sanitized = sanitizeFtsQuery(q)
  if (!sanitized) return { q, results: [] }

  const { env } = context.cloudflare
  const user = await requireRole(request, env, "viewer")
  const db = getDb(env)

  // Trigram tokenizer supports direct substring MATCH with quoted strings
  const ftsQuery = `"${sanitized}"`

  const matched = await db.all<{
    page_id: string
    rank: number
  }>(
    sql`SELECT page_id, rank
        FROM pages_fts_trigram
        WHERE pages_fts_trigram MATCH ${ftsQuery}
        ORDER BY rank
        LIMIT 50`,
  )

  if (matched.length === 0) return { q, results: [] }

  const pageIds = matched.map((r) => r.page_id)

  const visFilter = buildVisibilityFilter(user)

  // Fetch full page data for matched IDs, filtered to published + visibility
  const pages = await db
    .select({
      id: schema.pages.id,
      slug: schema.pages.slug,
      titleJa: schema.pages.titleJa,
      titleEn: schema.pages.titleEn,
      summaryJa: schema.pages.summaryJa,
      summaryEn: schema.pages.summaryEn,
      updatedAt: schema.pages.updatedAt,
    })
    .from(schema.pages)
    .where(and(inArray(schema.pages.id, pageIds), eq(schema.pages.status, "published"), visFilter))
    .all()

  // Preserve FTS rank order
  const pageById = new Map(pages.map((p) => [p.id, p]))
  const orderedPages = pageIds.map((id) => pageById.get(id)).filter(Boolean) as typeof pages

  // Fetch tags for result pages
  type PageTag = {
    pageId: string
    tagSlug: string
    labelJa: string
    labelEn: string
    color: string
  }
  let pageTags: PageTag[] = []
  const resultIds = orderedPages.map((p) => p.id)
  if (resultIds.length > 0) {
    pageTags = await db
      .select({
        pageId: schema.pageTags.pageId,
        tagSlug: schema.pageTags.tagSlug,
        labelJa: schema.tags.labelJa,
        labelEn: schema.tags.labelEn,
        color: schema.tags.color,
      })
      .from(schema.pageTags)
      .innerJoin(schema.tags, eq(schema.pageTags.tagSlug, schema.tags.slug))
      .where(inArray(schema.pageTags.pageId, resultIds))
      .all()
  }

  const tagsByPage = new Map<string, PageTag[]>()
  for (const pt of pageTags) {
    const arr = tagsByPage.get(pt.pageId) ?? []
    arr.push(pt)
    tagsByPage.set(pt.pageId, arr)
  }

  return {
    q,
    results: orderedPages.map((p) => ({ ...p, tags: tagsByPage.get(p.id) ?? [] })),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SearchPage() {
  const { q, results } = useLoaderData<typeof loader>()
  const { t, i18n } = useTranslation()
  const isJa = i18n.language === "ja"

  return (
    <div className="max-w-3xl px-8 py-8">
      <h1 className="mb-1 text-lg font-semibold text-gray-900">{t("search.title")}</h1>

      {!q ? (
        <p className="mt-4 text-sm text-gray-500">{t("search.empty_query")}</p>
      ) : results.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">{t("search.no_results", { query: q })}</p>
      ) : (
        <>
          <p className="mb-6 text-sm text-gray-500">
            {t("search.results_count", { count: results.length })}
          </p>

          <ul className="flex flex-col gap-3">
            {results.map((page) => {
              const title = isJa ? page.titleJa || page.titleEn : page.titleEn || page.titleJa
              const summary = isJa
                ? page.summaryJa || page.summaryEn
                : page.summaryEn || page.summaryJa

              return (
                <li key={page.id}>
                  <Link
                    to={`/wiki/${page.slug}`}
                    className="block rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-blue-500/40 hover:shadow-sm"
                  >
                    <h2 className="font-medium text-gray-900">{title}</h2>

                    {summary && (
                      <p className="mt-1 line-clamp-2 text-sm text-gray-500">{summary}</p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {page.tags.map((tag) => (
                        <span
                          key={tag.tagSlug}
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: tag.color }}
                        >
                          {isJa ? tag.labelJa : tag.labelEn}
                        </span>
                      ))}

                      {page.updatedAt && (
                        <time className="ml-auto text-xs text-gray-400">
                          {timeAgo(new Date(page.updatedAt), t)}
                        </time>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
