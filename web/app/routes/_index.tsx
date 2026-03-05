import { and, desc, eq, inArray } from "drizzle-orm"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useLoaderData } from "react-router"
import type { LoaderFunctionArgs, MetaFunction } from "react-router"
import LandingContent, { GoogleIcon } from "~/components/LandingContent"
import TagChip from "~/components/TagChip"
import * as schema from "~/db/schema"
import { getSessionUser } from "~/lib/auth-utils.server"
import { authClient } from "~/lib/auth.client"
import { getDb } from "~/lib/db.server"
import { buildVisibilityFilter } from "~/lib/page-visibility.server"

export const meta: MetaFunction<typeof loader> = ({ matches }) => {
  const origin = (matches.find((m) => m.id === "root")?.data as { origin?: string })?.origin ?? ""
  const parentMeta = matches.flatMap((m) => m.meta ?? [])
  return [
    ...parentMeta,
    { title: "GDGoC Japan Wiki" },
    {
      name: "description",
      content: "AI-powered bilingual knowledge base for GDGoC Japan chapters.",
    },
    { property: "og:title", content: "GDGoC Japan Wiki" },
    {
      property: "og:description",
      content:
        "AI-powered bilingual knowledge base for Google Developer Groups on Campus Japan chapters. Share chapter know-how, resources, and best practices — all in one place.",
    },
    { property: "og:url", content: `${origin}/` },
  ]
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  const user = await getSessionUser(request, env)

  if (!user) {
    return { mode: "lp" as const }
  }

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
  type PageTag = {
    pageId: string
    tagSlug: string
    labelJa: string
    labelEn: string
    color: string
  }
  let pageTags: PageTag[] = []
  if (recentPages.length > 0) {
    const ids = recentPages.map((p) => p.id)
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
    mode: "home" as const,
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
// Sign-in Modal
// ---------------------------------------------------------------------------

function SignInModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()

  async function handleGoogleSignIn() {
    await authClient.signIn.social({ provider: "google", callbackURL: "/" })
  }

  return (
    <div
      className="force-light fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose()
      }}
    >
      <dialog
        open
        className="relative m-0 w-full max-w-sm rounded-2xl border-2 border-black bg-white p-8 shadow-[8px_8px_0px_0px_#000]"
        aria-labelledby="signin-modal-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
          aria-label={t("close")}
        >
          ×
        </button>

        <div className="mb-6 text-center">
          <h2 id="signin-modal-title" className="text-lg font-semibold text-gray-900">
            {t("lp.signin_modal_title")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{t("lp.signin_modal_subtitle")}</p>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <GoogleIcon />
          {t("lp.cta_signin")}
        </button>

        <p className="mt-4 text-center text-xs text-gray-400">{t("login.access_restricted")}</p>
      </dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LP Header
// ---------------------------------------------------------------------------

function LpHeader({ onLoginClick }: { onLoginClick: () => void }) {
  const { t } = useTranslation()
  return (
    <header className="force-light sticky top-0 z-40 flex h-14 items-center justify-between border-b border-black bg-white px-6">
      <img src="/logo.png" alt={t("app_name")} className="h-8 w-auto" />
      <button
        type="button"
        onClick={onLoginClick}
        className="rounded-xl border-2 border-black bg-blue-500 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
      >
        {t("auth.sign_in")}
      </button>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Index() {
  const data = useLoaderData<typeof loader>()
  const { t, i18n } = useTranslation()
  const [modalOpen, setModalOpen] = useState(false)

  // Landing page for unauthenticated visitors
  if (data.mode === "lp") {
    const ctaSlot = (
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-3 rounded-xl border-2 border-black bg-blue-500 px-6 py-3 text-base font-semibold text-white shadow-[4px_4px_0px_0px_#000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#000]"
      >
        <GoogleIcon />
        {t("lp.cta_signin")}
      </button>
    )

    return (
      <>
        <LpHeader onLoginClick={() => setModalOpen(true)} />
        <LandingContent ctaSlot={ctaSlot} />
        {modalOpen && <SignInModal onClose={() => setModalOpen(false)} />}
      </>
    )
  }

  // Home page for authenticated users
  const { recentPages, allTags } = data
  const isJa = i18n.language !== "en"

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
                  {isJa ? page.titleJa || page.titleEn : page.titleEn || page.titleJa}
                </h3>

                {(page.summaryEn || page.summaryJa) && (
                  <p className="line-clamp-2 text-sm text-gray-500">
                    {isJa ? page.summaryJa || page.summaryEn : page.summaryEn || page.summaryJa}
                  </p>
                )}

                <div className="mt-auto flex flex-wrap gap-1 pt-1">
                  {page.tags.map((tag) => (
                    <span
                      key={tag.tagSlug}
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      {isJa ? tag.labelJa : tag.labelEn}
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
              <TagChip
                key={tag.slug}
                tagSlug={tag.slug}
                labelJa={tag.labelJa}
                labelEn={tag.labelEn}
                color={tag.color}
                size="md"
                pageCount={tag.pageCount}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
