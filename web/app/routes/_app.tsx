import { and, eq, isNull, sql } from "drizzle-orm"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Outlet, redirect, useLoaderData, useLocation, useParams } from "react-router"
import type { LoaderFunctionArgs } from "react-router"
import Footer from "~/components/Footer"
import Navbar from "~/components/Navbar"
import Sidebar from "~/components/Sidebar"
import StarredDialog from "~/components/StarredDialog"
import StarredPopover from "~/components/StarredPopover"
import * as schema from "~/db/schema"
import { useMediaQuery } from "~/hooks/useMediaQuery"
import { getSessionUser } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"
import { buildTree } from "~/lib/page-tree"
import { buildVisibilityFilter } from "~/lib/page-visibility.server"

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  const user = await getSessionUser(request, env)

  if (user?.role === "pending" || user?.role === "viewer") throw redirect("/pending")

  if (!user) {
    return { user: null, pageTree: [] as ReturnType<typeof buildTree>, unreadNotificationCount: 0 }
  }

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
  const location = useLocation()

  const isMobile = useMediaQuery("(max-width: 767px)")

  const [desktopOpen, setDesktopOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [starredDialogOpen, setStarredDialogOpen] = useState(false)
  const starredButtonRef = useRef<HTMLButtonElement>(null)

  const lang: "ja" | "en" = i18n.language === "en" ? "en" : "ja"

  // Restore desktop sidebar state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("gdgoc-sidebar-open")
      if (stored !== null) setDesktopOpen(stored === "true")
    } catch {
      // ignore – localStorage unavailable
    }
  }, [])

  // Close mobile drawer on route change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on pathname change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Close starred UI when switching between mobile/desktop to avoid glitches
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on isMobile change
  useEffect(() => {
    setStarredDialogOpen(false)
  }, [isMobile])

  // When unauthenticated, render only the outlet (child handles its own UI)
  if (!user) return <Outlet />

  function toggleSidebar() {
    if (isMobile) {
      setMobileOpen((v) => !v)
    } else {
      setDesktopOpen((v) => {
        const next = !v
        try {
          localStorage.setItem("gdgoc-sidebar-open", String(next))
        } catch {
          // ignore
        }
        return next
      })
    }
  }

  const sidebarOpen = isMobile ? mobileOpen : desktopOpen

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
          isMobile={isMobile}
          onClose={() => setMobileOpen(false)}
          onStarredClick={() => setStarredDialogOpen(true)}
          starredButtonRef={starredButtonRef}
        />

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer />
        </div>
      </div>
      {isMobile ? (
        <StarredDialog
          open={starredDialogOpen}
          onClose={() => setStarredDialogOpen(false)}
          lang={lang}
        />
      ) : (
        <StarredPopover
          open={starredDialogOpen}
          onClose={() => setStarredDialogOpen(false)}
          anchorRef={starredButtonRef}
          lang={lang}
        />
      )}
    </div>
  )
}
