import { desc, eq } from "drizzle-orm"
import { useTranslation } from "react-i18next"
import { Form, Link, useLoaderData } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  await requireRole(request, env, "admin")
  const db = getDb(env)

  const pages = await db
    .select({
      id: schema.pages.id,
      slug: schema.pages.slug,
      titleJa: schema.pages.titleJa,
      titleEn: schema.pages.titleEn,
      status: schema.pages.status,
      authorId: schema.pages.authorId,
      authorName: schema.user.name,
      createdAt: schema.pages.createdAt,
      updatedAt: schema.pages.updatedAt,
    })
    .from(schema.pages)
    .leftJoin(schema.user, eq(schema.pages.authorId, schema.user.id))
    .orderBy(desc(schema.pages.updatedAt))
    .all()

  return { pages }
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.cloudflare
  await requireRole(request, env, "admin")
  const form = await request.formData()
  const intent = form.get("intent")

  if (intent === "deletePage") {
    const pageId = form.get("pageId") as string
    const db = getDb(env)
    await db.batch([
      db.delete(schema.pageTags).where(eq(schema.pageTags.pageId, pageId)),
      db.delete(schema.pageAttachments).where(eq(schema.pageAttachments.pageId, pageId)),
      db.delete(schema.pageVersions).where(eq(schema.pageVersions.pageId, pageId)),
      db.delete(schema.pages).where(eq(schema.pages.id, pageId)),
    ])
  }

  return {}
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const isPublished = status === "published"
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        isPublished ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700",
      ].join(" ")}
    >
      {status}
    </span>
  )
}

export default function AdminPages() {
  const { pages } = useLoaderData<typeof loader>()
  const { t } = useTranslation()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{t("admin.pages.heading")}</h1>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">
                {t("admin.pages.col_title")}
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">
                {t("admin.pages.col_status")}
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">
                {t("admin.pages.col_author")}
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">
                {t("admin.pages.col_updated")}
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pages.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link to={`/wiki/${p.slug}`} className="group">
                    <p className="font-medium text-gray-900 group-hover:text-blue-600">
                      {p.titleJa}
                    </p>
                    {p.titleEn && <p className="text-xs text-gray-400">{p.titleEn}</p>}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3 text-gray-600">{p.authorName ?? "—"}</td>
                <td className="px-4 py-3 text-gray-500">
                  {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      to={`/wiki/${p.slug}/edit`}
                      className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                    >
                      {t("admin.pages.edit")}
                    </Link>
                    <Form
                      method="post"
                      onSubmit={(e) => {
                        if (
                          !window.confirm(t("admin.pages.delete_confirm", { title: p.titleJa }))
                        ) {
                          e.preventDefault()
                        }
                      }}
                    >
                      <input type="hidden" name="intent" value="deletePage" />
                      <input type="hidden" name="pageId" value={p.id} />
                      <button
                        type="submit"
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        {t("admin.pages.delete")}
                      </button>
                    </Form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {pages.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">{t("admin.pages.empty")}</p>
        )}
      </div>
    </div>
  )
}
