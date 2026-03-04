import { eq } from "drizzle-orm"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import type { LoaderFunctionArgs, MetaFunction } from "react-router"
import { useFetcher, useLoaderData } from "react-router"
import { TipTapRenderer, extractTocItems } from "~/components/TipTapRenderer"
import type { TipTapDoc } from "~/components/TipTapRenderer"
import WikiRightSidebar from "~/components/WikiRightSidebar"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"

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

  const [pageTags, authorRow, editorRow] = await Promise.all([
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
  ])

  const url = new URL(request.url)
  const langParam = url.searchParams.get("lang")
  const lang: "ja" | "en" = langParam === "ja" || langParam === "en" ? langParam : "ja"

  return {
    page,
    tags: pageTags,
    author: authorRow ?? null,
    editor: editorRow ?? null,
    lang,
    userRole: sessionUser.role,
  }
}

function parseDoc(json: string): TipTapDoc | null {
  if (!json) return null
  try {
    return JSON.parse(json) as TipTapDoc
  } catch {
    return null
  }
}

export default function WikiPage() {
  const { page, tags, author, editor, lang, userRole } = useLoaderData<typeof loader>()
  const { t } = useTranslation()
  const contentLangFetcher = useFetcher()
  const submitRef = contentLangFetcher.submit

  // Persist content lang selection
  useEffect(() => {
    localStorage.setItem("content_lang", lang)
    submitRef({ lang }, { method: "post", action: "/api/set-content-lang" })
  }, [lang, submitRef])

  const primaryContent = lang === "en" ? page.contentEn : page.contentJa
  const fallbackContent = lang === "en" ? page.contentJa : page.contentEn
  const title = lang === "en" ? page.titleEn || page.titleJa : page.titleJa || page.titleEn

  let doc = parseDoc(primaryContent)
  let usingFallback = false
  if (!doc) {
    doc = parseDoc(fallbackContent)
    usingFallback = true
  }

  const tocItems = doc ? extractTocItems(doc) : []
  const canEdit = userRole === "admin" || userRole === "lead"

  return (
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

        {usingFallback && doc && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {lang === "en" ? t("wiki.translation_fallback_en") : t("wiki.translation_fallback_ja")}
          </div>
        )}

        {doc ? (
          <TipTapRenderer doc={doc} />
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
        canEdit={canEdit}
      />
    </div>
  )
}
