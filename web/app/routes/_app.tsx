import { and, eq, isNull, sql } from "drizzle-orm"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Outlet, useLoaderData, useParams } from "react-router"
import type { LoaderFunctionArgs } from "react-router"
import Footer from "~/components/Footer"
import Navbar from "~/components/Navbar"
import Sidebar from "~/components/Sidebar"
import StarredDialog from "~/components/StarredDialog"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"
import { buildTree } from "~/lib/page-tree"
import { buildVisibilityFilter } from "~/lib/page-visibility.server"

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  const user = await requireRole(request, env, "viewer")
  const db = getDb(env)

  const visFilter = buildVisibilityFilter(user)
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
    .where(and(eq(schema.pages.status, "published"), visFilter))
    .orderBy(schema.pages.sortOrder)
    .all()

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)))
    .get()

  const unreadNotificationCount = countResult?.count ?? 0

  return { user, pageTree: buildTree(treeRows), unreadNotificationCount }
}

// ---------------------------------------------------------------------------
// Layout component
// ---------------------------------------------------------------------------

export default function AppLayout() {
  const { user, pageTree, unreadNotificationCount } = useLoaderData<typeof loader>()
  const { slug } = useParams()
  const { i18n } = useTranslation()

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [starredDialogOpen, setStarredDialogOpen] = useState(false)

  const lang: "ja" | "en" = i18n.language === "en" ? "en" : "ja"

  useEffect(() => {
    try {
      const stored = localStorage.getItem("gdgoc-sidebar-open")
      if (stored !== null) setSidebarOpen(stored === "true")
    } catch {
      // ignore – localStorage unavailable
    }
  }, [])

  function toggleSidebar() {
    setSidebarOpen((v) => {
      const next = !v
      try {
        localStorage.setItem("gdgoc-sidebar-open", String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        user={user}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        unreadNotificationCount={unreadNotificationCount}
      />

      <div className="flex flex-1 pt-14">
        <Sidebar
          pages={pageTree}
          currentSlug={slug}
          userRole={user.role}
          isOpen={sidebarOpen}
          onStarredClick={() => setStarredDialogOpen(true)}
        />

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer />
        </div>
      </div>
      <StarredDialog
        open={starredDialogOpen}
        onClose={() => setStarredDialogOpen(false)}
        lang={lang}
      />
    </div>
  )
}
