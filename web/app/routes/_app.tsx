import { eq } from "drizzle-orm"
import { Outlet, useLoaderData, useParams } from "react-router"
import type { LoaderFunctionArgs } from "react-router"
import Navbar from "~/components/Navbar"
import PageTree from "~/components/PageTree"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"
import { buildTree } from "~/lib/page-tree"

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  const user = await requireRole(request, env, "viewer")
  const db = getDb(env)

  const treeRows = await db
    .select({
      id: schema.pages.id,
      slug: schema.pages.slug,
      titleJa: schema.pages.titleJa,
      titleEn: schema.pages.titleEn,
      parentId: schema.pages.parentId,
      sortOrder: schema.pages.sortOrder,
    })
    .from(schema.pages)
    .where(eq(schema.pages.status, "published"))
    .orderBy(schema.pages.sortOrder)
    .all()

  return { user, pageTree: buildTree(treeRows) }
}

// ---------------------------------------------------------------------------
// Layout component
// ---------------------------------------------------------------------------

export default function AppLayout() {
  const { user, pageTree } = useLoaderData<typeof loader>()
  const { slug } = useParams()

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar user={user} />

      <div className="flex flex-1 pt-14">
        {/* Left sidebar */}
        <aside className="fixed bottom-0 left-0 top-14 w-60 overflow-hidden border-r border-gray-200 bg-white">
          <PageTree pages={pageTree} currentSlug={slug} />
        </aside>

        {/* Main content */}
        <main className="ml-60 min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
