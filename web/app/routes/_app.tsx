import { eq } from "drizzle-orm"
import { Outlet, useLoaderData, useParams } from "react-router"
import type { LoaderFunctionArgs } from "react-router"
import Navbar from "~/components/Navbar"
import Sidebar from "~/components/Sidebar"
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
        <Sidebar pages={pageTree} currentSlug={slug} userRole={user.role} />

        {/* Main content */}
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
