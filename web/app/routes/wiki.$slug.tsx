import { eq } from "drizzle-orm"
import type { LoaderFunctionArgs, MetaFunction } from "react-router"
import { useLoaderData } from "react-router"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `${data.titleEn || data.titleJa} — GDGoC Japan Wiki` : "Page not found" },
]

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  await requireRole(request, env, "viewer")
  const db = getDb(env)

  const page = await db
    .select({
      id: schema.pages.id,
      titleJa: schema.pages.titleJa,
      titleEn: schema.pages.titleEn,
      slug: schema.pages.slug,
      status: schema.pages.status,
    })
    .from(schema.pages)
    .where(eq(schema.pages.slug, params.slug ?? ""))
    .get()

  if (!page || page.status !== "published") {
    throw new Response("Not Found", { status: 404 })
  }

  return page
}

export default function WikiPage() {
  const page = useLoaderData<typeof loader>()

  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900">{page.titleEn || page.titleJa}</h1>
      <p className="mt-4 text-sm text-gray-400">Full page view coming soon.</p>
    </div>
  )
}
