import { and, desc, eq, inArray } from "drizzle-orm"
import { useTranslation } from "react-i18next"
import { Link, useLoaderData } from "react-router"
import type { LoaderFunctionArgs, MetaFunction } from "react-router"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"
import { buildVisibilityFilter } from "~/lib/page-visibility.server"

export const meta: MetaFunction = () => [{ title: "Home — GDGoC Japan Wiki" }]

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  const user = await requireRole(request, env, "viewer")
  const db = getDb(env)

  const visFilter = buildVisibilityFilter(user)

  // Recent 6 published pages
  const recentPages = await db
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
    .where(and(eq(schema.pages.status, "published"), visFilter))
    .orderBy(desc(schema.pages.updatedAt))
    .limit(6)
    .all()

  // Tags for those pages
  type PageTag = { pageId: string; tagSlug: string; labelEn: string; color: string }
  let pageTags: PageTag[] = []
  if (recentPages.length > 0) {
    const ids = recentPages.map((p) => p.id)
    pageTags = await db
      .select({
        pageId: schema.pageTags.pageId,
        tagSlug: schema.pageTags.tagSlug,
        labelEn: schema.tags.labelEn,
        color: schema.tags.color,
      })
      .from(schema.pageTags)
      .innerJoin(schema.tags, eq(schema.pageTags.tagSlug, schema.tags.slug))
      .where(inArray(schema.pageTags.pageId, ids))
      .all()
  }

  // Group tags by pageId
  const tagsByPage = new Map<string, PageTag[]>()
  for (const pt of pageTags) {
    const arr = tagsByPage.get(pt.pageId) ?? []
    arr.push(pt)
    tagsByPage.set(pt.pageId, arr)
  }

  // All tags ordered by popularity
  const allTags = await db.select().from(schema.tags).orderBy(desc(schema.tags.pageCount)).all()

  return {
    recentPages: recentPages.map((p) => ({ ...p, tags: tagsByPage.get(p.id) ?? [] })),
    allTags,
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

export default function Index() {
  const { recentPages, allTags } = useLoaderData<typeof loader>()
  const { t } = useTranslation()

  return (
    <div className="max-w-5xl px-4 py-6 md:px-8 md:py-8">
      {/* Recently Updated */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("home.recently_updated")}</h2>

        {recentPages.length === 0 ? (
          <p className="text-sm text-gray-400">{t("home.no_pages_yet")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentPages.map((page) => (
              <Link
                key={page.id}
                to={`/wiki/${page.slug}`}
                className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-blue-500/40 hover:shadow-sm"
              >
                <h3 className="line-clamp-2 font-medium text-gray-900">
                  {page.titleEn || page.titleJa}
                </h3>

                {(page.summaryEn || page.summaryJa) && (
                  <p className="line-clamp-2 text-sm text-gray-500">
                    {page.summaryEn || page.summaryJa}
                  </p>
                )}

                <div className="mt-auto flex flex-wrap gap-1 pt-1">
                  {page.tags.map((tag) => (
                    <span
                      key={tag.tagSlug}
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.labelEn}
                    </span>
                  ))}
                </div>

                {page.updatedAt && (
                  <time className="text-xs text-gray-400">
                    {timeAgo(new Date(page.updatedAt), t)}
                  </time>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Browse by Tag */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("home.browse_by_tag")}</h2>

        {allTags.length === 0 ? (
          <p className="text-sm text-gray-400">{t("home.no_tags_yet")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => (
              <Link
                key={tag.slug}
                to={`/?tag=${tag.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:text-white"
                style={{ borderColor: tag.color, color: tag.color }}
              >
                {tag.labelEn}
                {tag.pageCount > 0 && <span className="text-xs opacity-70">({tag.pageCount})</span>}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
