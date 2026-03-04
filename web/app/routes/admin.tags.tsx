import { desc } from "drizzle-orm"
import { useLoaderData } from "react-router"
import type { LoaderFunctionArgs } from "react-router"
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
  const tags = await db.select().from(schema.tags).orderBy(desc(schema.tags.pageCount)).all()
  return { tags }
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export default function AdminTags() {
  const { tags } = useLoaderData<typeof loader>()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Tags</h1>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Color</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Slug</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Label (JA)</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Label (EN)</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Pages</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tags.map((tag) => (
              <tr key={tag.slug} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div
                    className="h-5 w-5 rounded"
                    style={{ backgroundColor: tag.color }}
                    title={tag.color}
                  />
                </td>
                <td className="px-4 py-3 font-mono text-gray-700">{tag.slug}</td>
                <td className="px-4 py-3 text-gray-900">{tag.labelJa}</td>
                <td className="px-4 py-3 text-gray-600">{tag.labelEn}</td>
                <td className="px-4 py-3 text-gray-500">{tag.pageCount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {tags.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No tags found.</p>
        )}
      </div>
    </div>
  )
}
