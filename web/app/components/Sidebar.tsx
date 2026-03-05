import { Clock, Home, Settings, Star } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation } from "react-router"
import PageTree from "~/components/PageTree"
import type { PageNode } from "~/lib/page-tree"

const COLLAPSE_THRESHOLD = 120
const DEFAULT_WIDTH = 240
const MIN_WIDTH = 48
const MAX_WIDTH = 400
const STORAGE_KEY = "gdgoc-sidebar-width"

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
  isCollapsed: boolean
  isActive: boolean
}

function NavItem({ to, icon, label, isCollapsed, isActive }: NavItemProps) {
  return (
    <Link
      to={to}
      title={isCollapsed ? label : undefined}
      className={`flex min-h-8 items-center gap-2 rounded px-2 py-1.5 text-sm ${
        isActive ? "bg-blue-500/10 font-medium text-blue-500" : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      {!isCollapsed && <span className="truncate">{label}</span>}
    </Link>
  )
}

interface SidebarProps {
  pages: PageNode[]
  currentSlug?: string
  userRole?: string
}

export default function Sidebar({ pages, currentSlug, userRole }: SidebarProps) {
  const { t } = useTranslation()
  const location = useLocation()

  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? Number(stored) : DEFAULT_WIDTH
  })

  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const isCollapsed = width < COLLAPSE_THRESHOLD

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return
    const delta = e.clientX - startX.current
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta))
    setWidth(newWidth)
  }, [])

  const onMouseUp = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    setWidth((w) => {
      localStorage.setItem(STORAGE_KEY, String(w))
      return w
    })
    window.removeEventListener("mousemove", onMouseMove)
    window.removeEventListener("mouseup", onMouseUp)
  }, [onMouseMove])

  const onDragHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      startX.current = e.clientX
      startWidth.current = width
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      window.addEventListener("mousemove", onMouseMove)
      window.addEventListener("mouseup", onMouseUp)
    },
    [width, onMouseMove, onMouseUp],
  )

  // Clean up listeners on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  return (
    <>
      {/* Sidebar */}
      <aside
        style={{ width }}
        className="fixed bottom-0 left-0 top-14 overflow-hidden border-r border-gray-200 bg-white"
      >
        <div className="flex h-full flex-col">
          {/* Nav items */}
          <nav aria-label="Main navigation" className="px-2 pt-3 pb-1 space-y-0.5">
            <NavItem
              to="/"
              icon={<Home size={16} />}
              label={t("nav.home")}
              isCollapsed={isCollapsed}
              isActive={location.pathname === "/"}
            />
            <NavItem
              to="/recent"
              icon={<Clock size={16} />}
              label={t("nav.recent")}
              isCollapsed={isCollapsed}
              isActive={location.pathname === "/recent"}
            />
            <NavItem
              to="/starred"
              icon={<Star size={16} />}
              label={t("nav.starred")}
              isCollapsed={isCollapsed}
              isActive={location.pathname === "/starred"}
            />
            {userRole === "admin" && (
              <NavItem
                to="/admin"
                icon={<Settings size={16} />}
                label={t("nav.admin")}
                isCollapsed={isCollapsed}
                isActive={location.pathname.startsWith("/admin")}
              />
            )}
          </nav>

          {/* Divider */}
          <div className="mx-2 my-1 border-t border-gray-100" />

          {/* Page tree */}
          <div className="min-h-0 flex-1">
            <PageTree
              pages={pages}
              currentSlug={currentSlug}
              isCollapsed={isCollapsed}
              canReorder={!isCollapsed && ["member", "lead", "admin"].includes(userRole ?? "")}
            />
          </div>
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={onDragHandleMouseDown}
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-200/50 active:bg-blue-300/50"
          aria-hidden="true"
        />
      </aside>

      {/* Spacer for main content */}
      <div style={{ width }} className="flex-shrink-0" />
    </>
  )
}

export { COLLAPSE_THRESHOLD, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH, STORAGE_KEY }
