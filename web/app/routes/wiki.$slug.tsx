import { and, eq } from "drizzle-orm"
import { MdPreview } from "md-editor-rt"
import "md-editor-rt/lib/preview.css"
import { List, Pencil, Share2, Star, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router"
import { Link, useFetcher, useLoaderData, useLocation } from "react-router"
import type { TocItem } from "~/components/WikiRightSidebar"
import WikiRightSidebar from "~/components/WikiRightSidebar"
import * as schema from "~/db/schema"
import { useMediaQuery } from "~/hooks/useMediaQuery"
import { useThemeMode } from "~/hooks/useThemeMode"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"
import { canUserChangeVisibility, canUserSeePage } from "~/lib/page-visibility.server"
import { tiptapToMarkdown } from "~/lib/tiptap-convert"

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data ? `${data.page.titleEn || data.page.titleJa} — GDGoC Japan Wiki` : "Page not found",
  },
]

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
      contentJa: schema.pages.contentJa,
      contentEn: schema.pages.contentEn,
      translationStatusJa: schema.pages.translationStatusJa,
      translationStatusEn: schema.pages.translationStatusEn,
      summaryJa: schema.pages.summaryJa,
      summaryEn: schema.pages.summaryEn,
      pageType: schema.pages.pageType,
      visibility: schema.pages.visibility,
      chapterId: schema.pages.chapterId,
      authorId: schema.pages.authorId,
      lastEditedBy: schema.pages.lastEditedBy,
      updatedAt: schema.pages.updatedAt,
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

  const [pageTags, authorRow, editorRow, fav] = await Promise.all([
    db
      .select({
        tagSlug: schema.pageTags.tagSlug,
        labelJa: schema.tags.labelJa,
        labelEn: schema.tags.labelEn,
        color: schema.tags.color,
      })
      .from(schema.pageTags)
      .innerJoin(schema.tags, eq(schema.pageTags.tagSlug, schema.tags.slug))
      .where(eq(schema.pageTags.pageId, page.id))
      .all(),
    db
      .select({ id: schema.user.id, name: schema.user.name, image: schema.user.image })
      .from(schema.user)
      .where(eq(schema.user.id, page.authorId))
      .get(),
    db
      .select({ id: schema.user.id, name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, page.lastEditedBy))
      .get(),
    db
      .select()
      .from(schema.pageFavorites)
      .where(
        and(
          eq(schema.pageFavorites.userId, sessionUser.id),
          eq(schema.pageFavorites.pageId, page.id),
        ),
      )
      .get(),
  ])

  const url = new URL(request.url)
  const langParam = url.searchParams.get("lang")
  const lang: "ja" | "en" = langParam === "ja" || langParam === "en" ? langParam : "ja"

  return {
    page: {
      ...page,
      contentJa: tiptapToMarkdown(page.contentJa ?? ""),
      contentEn: tiptapToMarkdown(page.contentEn ?? ""),
    },
    tags: pageTags,
    author: authorRow ?? null,
    editor: editorRow ?? null,
    lang,
    userRole: sessionUser.role,
    visibility: page.visibility,
    canChangeVisibility: canUserChangeVisibility(sessionUser, page),
    isStarred: !!fav,
  }
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

const VALID_VISIBILITY = ["public", "private_to_chapter", "private_to_lead"] as const

export async function action({ request, context, params }: ActionFunctionArgs) {
  const { env } = context.cloudflare
  const sessionUser = await requireRole(request, env, "viewer")
  const db = getDb(env)

  const form = await request.formData()
  const intent = form.get("intent")

  if (intent === "setVisibility") {
    const newVisibility = form.get("visibility") as string
    if (!VALID_VISIBILITY.includes(newVisibility as (typeof VALID_VISIBILITY)[number])) {
      return new Response("Invalid visibility value", { status: 400 })
    }

    const page = await db
      .select({
        id: schema.pages.id,
        visibility: schema.pages.visibility,
        chapterId: schema.pages.chapterId,
        authorId: schema.pages.authorId,
      })
      .from(schema.pages)
      .where(eq(schema.pages.slug, params.slug ?? ""))
      .get()

    if (!page) throw new Response("Not Found", { status: 404 })

    if (!canUserChangeVisibility(sessionUser, page)) {
      throw new Response("Forbidden", { status: 403 })
    }

    // Auto-assign chapterId from user when setting chapter/lead-private on a page without one
    let chapterId = page.chapterId
    if (newVisibility !== "public" && !chapterId) {
      if (!sessionUser.chapterId) {
        return new Response("Cannot set chapter-scoped visibility without a chapter", {
          status: 400,
        })
      }
      chapterId = sessionUser.chapterId
    }

    await db
      .update(schema.pages)
      .set({ visibility: newVisibility, chapterId })
      .where(eq(schema.pages.id, page.id))

    return { ok: true }
  }

  if (intent === "toggleFavorite") {
    const pageId = form.get("pageId")
    if (typeof pageId !== "string" || !pageId) {
      return new Response("Missing pageId", { status: 400 })
    }

    const existing = await db
      .select()
      .from(schema.pageFavorites)
      .where(
        and(
          eq(schema.pageFavorites.userId, sessionUser.id),
          eq(schema.pageFavorites.pageId, pageId),
        ),
      )
      .get()

    if (existing) {
      await db
        .delete(schema.pageFavorites)
        .where(
          and(
            eq(schema.pageFavorites.userId, sessionUser.id),
            eq(schema.pageFavorites.pageId, pageId),
          ),
        )
      return { ok: true, starred: false }
    }
    await db.insert(schema.pageFavorites).values({ userId: sessionUser.id, pageId })
    return { ok: true, starred: true }
  }

  return new Response("Unknown intent", { status: 400 })
}

// ---------------------------------------------------------------------------
// Heading parser for initial SSR TOC
// ---------------------------------------------------------------------------

function parseMdHeadings(md: string): TocItem[] {
  const lines = md.split("\n")
  return lines.flatMap((line) => {
    const m = line.match(/^(#{1,6}) (.+)/)
    if (!m) return []
    const level = m[1].length
    if (level !== 2 && level !== 3) return []
    const text = m[2].trim()
    return [{ id: text, text, level }]
  })
}

export default function WikiPage() {
  const { page, tags, author, editor, lang, userRole, isStarred } = useLoaderData<typeof loader>()
  const { t } = useTranslation("common")
  const theme = useThemeMode()
  const location = useLocation()
  const contentLangFetcher = useFetcher()
  const submitRef = contentLangFetcher.submit

  // Persist content lang selection only when it differs from the stored value.
  useEffect(() => {
    const stored = localStorage.getItem("content_lang")
    if (stored === lang) return
    localStorage.setItem("content_lang", lang)
    submitRef({ lang }, { method: "post", action: "/api/set-content-lang" })
  }, [lang, submitRef])

  const primaryContent = lang === "en" ? page.contentEn : page.contentJa
  const fallbackContent = lang === "en" ? page.contentJa : page.contentEn
  const title = lang === "en" ? page.titleEn || page.titleJa : page.titleJa || page.titleEn

  const hasContent = primaryContent && primaryContent.trim().length > 0
  const hasFallback = !hasContent && fallbackContent && fallbackContent.trim().length > 0
  const displayContent = hasContent ? primaryContent : (fallbackContent ?? "")

  const [tocItems, setTocItems] = useState<TocItem[]>(() => parseMdHeadings(displayContent))
  const canEdit = userRole === "admin" || userRole === "lead"

  // Stable callback — avoids re-render loop when MdPreview fires onGetCatalog every render
  const handleGetCatalog = useCallback((list: Array<{ text: string; level: number }>) => {
    setTocItems((prev) => {
      const next = list
        .filter((h) => h.level === 2 || h.level === 3)
        .map((h) => ({ id: h.text, text: h.text, level: h.level }))
      if (
        prev.length === next.length &&
        prev.every((item, i) => item.id === next[i].id && item.level === next[i].level)
      ) {
        return prev // same data → same reference → no re-render
      }
      return next
    })
  }, [])

  const favFetcher = useFetcher<{ ok: boolean; starred: boolean }>()
  const [currentStarred, setCurrentStarred] = useState(isStarred)
  const [copied, setCopied] = useState(false)
  const [mobileContentsOpen, setMobileContentsOpen] = useState(false)
  const mobileContentsTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileContentsSheetRef = useRef<HTMLDivElement>(null)
  const previousFocusedElementRef = useRef<HTMLElement | null>(null)
  const isDesktop = useMediaQuery("(min-width: 768px)")

  // Sync with loader when navigating to a different page
  useEffect(() => {
    setCurrentStarred(isStarred)
  }, [isStarred])

  // Close mobile contents sheet on route change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on pathname change
  useEffect(() => {
    setMobileContentsOpen(false)
  }, [location.pathname])

  const closeMobileContents = useCallback(() => {
    setMobileContentsOpen(false)
    const restoreTarget = previousFocusedElementRef.current ?? mobileContentsTriggerRef.current
    if (restoreTarget) {
      window.requestAnimationFrame(() => restoreTarget.focus())
    }
  }, [])

  const openMobileContents = useCallback(() => {
    previousFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setMobileContentsOpen(true)
  }, [])

  useEffect(() => {
    if (!mobileContentsOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileContents()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [mobileContentsOpen, closeMobileContents])

  useEffect(() => {
    if (!mobileContentsOpen) return

    const sheet = mobileContentsSheetRef.current
    if (!sheet) return

    const firstFocusable = sheet.querySelector<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    ;(firstFocusable ?? sheet).focus()
  }, [mobileContentsOpen])

  // Optimistic star state for the action bar toggle
  const optimisticStarred = favFetcher.state !== "idle" ? !currentStarred : currentStarred

  function handleToggleStar() {
    favFetcher.submit({ intent: "toggleFavorite", pageId: page.id }, { method: "post" })
  }

  function handleShare() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const jaUrl = `${location.pathname}?lang=ja`
  const enUrl = `${location.pathname}?lang=en`

  const btnBase =
    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"

  return (
    <div>
      {/* Mini-header */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2 md:px-10">
        <div className="flex shrink-0 gap-1 rounded-md border border-gray-200 bg-white p-0.5">
          {(["ja", "en"] as const).map((l) => {
            const status = l === "ja" ? page.translationStatusJa : page.translationStatusEn
            const isPending = status === "missing"
            const isActive = lang === l
            const className = [
              "min-w-10 rounded px-2 py-1 text-center text-sm font-medium transition-colors",
              isActive
                ? "bg-blue-500 text-white"
                : isPending
                  ? "text-gray-300"
                  : "text-gray-600 hover:bg-gray-100",
            ].join(" ")

            if (isPending) {
              return (
                <span
                  key={l}
                  aria-disabled="true"
                  title={t("wiki.translation_pending")}
                  className={className}
                >
                  {l === "ja" ? "JA" : "EN"}
                </span>
              )
            }

            return (
              <Link key={l} to={l === "ja" ? jaUrl : enUrl} className={className}>
                {l === "ja" ? "JA" : "EN"}
              </Link>
            )
          })}
        </div>
        <div className="flex items-center gap-1">
          {canEdit && (
            <Link to={`/wiki/${page.slug}/edit`} className={btnBase}>
              <Pencil size={14} />
              {t("wiki.edit")}
            </Link>
          )}
          <button
            type="button"
            onClick={handleToggleStar}
            className={btnBase}
            style={optimisticStarred ? { color: "#E06C00" } : undefined}
          >
            <Star
              size={14}
              style={optimisticStarred ? { fill: "#E06C00", color: "#E06C00" } : undefined}
            />
            {optimisticStarred ? t("wiki.unstar") : t("wiki.starred")}
          </button>
          <button type="button" onClick={handleShare} className={btnBase}>
            <Share2 size={14} />
            {copied ? t("wiki.share_copied") : t("wiki.share")}
          </button>
        </div>
      </div>

      <div className="flex gap-0">
        <article className="max-w-3xl min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
          <h1 className="mb-4 text-3xl font-bold text-gray-900">{title}</h1>

          {/* Mobile "Contents" button */}
          {tocItems.length > 0 && (
            <button
              ref={mobileContentsTriggerRef}
              type="button"
              onClick={openMobileContents}
              className="mb-4 flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 md:hidden"
            >
              <List size={14} />
              {t("wiki.contents")}
            </button>
          )}
          {tags.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag.tagSlug}
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {lang === "en" ? tag.labelEn : tag.labelJa}
                </span>
              ))}
            </div>
          )}

          {hasFallback && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {lang === "en"
                ? t("wiki.translation_fallback_en")
                : t("wiki.translation_fallback_ja")}
            </div>
          )}

          {displayContent ? (
            <MdPreview
              modelValue={displayContent}
              theme={theme}
              autoFoldThreshold={Number.POSITIVE_INFINITY}
              onGetCatalog={handleGetCatalog}
            />
          ) : (
            <p className="text-gray-400">No content available.</p>
          )}
        </article>

        {/* Right sidebar — hidden on mobile */}
        {isDesktop && (
          <WikiRightSidebar
            tocItems={tocItems}
            author={author}
            editor={editor}
            updatedAt={page.updatedAt}
            tags={tags}
            lang={lang}
            translationStatusJa={page.translationStatusJa}
            translationStatusEn={page.translationStatusEn}
          />
        )}
      </div>

      {/* Mobile contents bottom sheet */}
      {mobileContentsOpen && (
        <>
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop closes via pointer; Escape handled by window keydown */}
          <div
            className="fixed inset-0 top-14 z-40 bg-black/40 md:hidden"
            onClick={closeMobileContents}
            aria-hidden="true"
          />
          <div
            ref={mobileContentsSheetRef}
            tabIndex={-1}
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-xl bg-white shadow-xl md:hidden"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="font-semibold text-gray-900">{t("wiki.contents")}</p>
              <button
                type="button"
                onClick={closeMobileContents}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label={t("common:close")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 px-4 py-3">
              {/* TOC */}
              {tocItems.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {t("wiki.on_this_page")}
                  </p>
                  <nav aria-label={t("tableOfContents")}>
                    <ul className="space-y-1">
                      {tocItems.map((item) => (
                        <li
                          key={item.id}
                          style={{ paddingLeft: item.level === 3 ? "0.75rem" : undefined }}
                        >
                          <a
                            href={`#${item.id}`}
                            onClick={closeMobileContents}
                            className="block truncate py-1 text-sm text-gray-600 hover:text-gray-900"
                          >
                            {item.text}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                </div>
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {t("wiki.tags")}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <span
                        key={tag.tagSlug}
                        className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
                        style={{ backgroundColor: tag.color }}
                      >
                        {lang === "en" ? tag.labelEn : tag.labelJa}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
