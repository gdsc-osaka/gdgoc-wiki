import { and, eq } from "drizzle-orm"
import { MdPreview } from "md-editor-rt"
import "md-editor-rt/lib/preview.css"
import { Pencil, Share2, Star } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router"
import { Link, useFetcher, useLoaderData } from "react-router"
import type { TocItem } from "~/components/WikiRightSidebar"
import WikiRightSidebar from "~/components/WikiRightSidebar"
import * as schema from "~/db/schema"
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
  const { page, tags, author, editor, lang, userRole, visibility, canChangeVisibility, isStarred } =
    useLoaderData<typeof loader>()
  const { t } = useTranslation()
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

  // Sync with loader when navigating to a different page
  useEffect(() => {
    setCurrentStarred(isStarred)
  }, [isStarred])

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

  const btnBase =
    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"

  return (
    <div>
      {/* Action bar */}
      <div className="flex items-center justify-end gap-1 border-b border-gray-100 px-10 py-2">
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

      <div className="flex gap-0">
        <article className="max-w-3xl flex-1 min-w-0 px-10 py-8">
          <h1 className="mb-4 text-3xl font-bold text-gray-900">{title}</h1>

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
              autoFoldThreshold={Number.POSITIVE_INFINITY}
              onGetCatalog={handleGetCatalog}
            />
          ) : (
            <p className="text-gray-400">No content available.</p>
          )}
        </article>

        <WikiRightSidebar
          tocItems={tocItems}
          author={author}
          editor={editor}
          updatedAt={page.updatedAt}
          tags={tags}
          lang={lang}
          translationStatusJa={page.translationStatusJa}
          translationStatusEn={page.translationStatusEn}
          slug={page.slug}
          visibility={visibility}
          canChangeVisibility={canChangeVisibility}
        />
      </div>
    </div>
  )
}
