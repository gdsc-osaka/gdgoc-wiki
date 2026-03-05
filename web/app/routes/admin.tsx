import { useTranslation } from "react-i18next"
import { NavLink, Outlet, useLoaderData } from "react-router"
import type { LoaderFunctionArgs } from "react-router"
import Navbar from "~/components/Navbar"
import { requireRole } from "~/lib/auth-utils.server"

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  const user = await requireRole(request, env, "admin")
  return { user }
}

// ---------------------------------------------------------------------------
// Admin sidebar nav items
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { to: "/admin/users", labelKey: "admin.nav.users" },
  { to: "/admin/pages", labelKey: "admin.nav.pages" },
  { to: "/admin/tags", labelKey: "admin.nav.tags" },
  { to: "/admin/stats", labelKey: "admin.nav.stats" },
] as const

// ---------------------------------------------------------------------------
// Layout component
// ---------------------------------------------------------------------------

export default function AdminLayout() {
  const { user } = useLoaderData<typeof loader>()
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar user={user} />

      <div className="flex flex-1 pt-14">
        {/* Admin sidebar */}
        <aside className="fixed bottom-0 left-0 top-14 w-60 overflow-hidden border-r border-gray-200 bg-white">
          <nav className="p-4">
            <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              {t("admin.label")}
            </p>
            <ul className="space-y-0.5">
              {NAV_ITEMS.map(({ to, labelKey }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      [
                        "block rounded-md px-3 py-2 text-sm font-medium",
                        isActive ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-100",
                      ].join(" ")
                    }
                  >
                    {t(labelKey)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Main content */}
        <main className="ml-60 min-w-0 flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
