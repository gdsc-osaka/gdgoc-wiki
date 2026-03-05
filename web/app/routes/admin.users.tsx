import { desc, eq } from "drizzle-orm"
import { useTranslation } from "react-i18next"
import { useFetcher, useLoaderData } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"

const ROLES = ["viewer", "member", "lead", "admin"] as const
type Role = (typeof ROLES)[number]

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  const currentUser = await requireRole(request, env, "admin")
  const db = getDb(env)
  const users = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      image: schema.user.image,
      role: schema.user.role,
      chapterId: schema.user.chapterId,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user)
    .orderBy(desc(schema.user.createdAt))
    .all()

  return { users, currentUserId: currentUser.id }
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.cloudflare
  const currentUser = await requireRole(request, env, "admin")
  const form = await request.formData()
  const intent = form.get("intent")

  if (intent === "updateRole") {
    const userId = form.get("userId") as string
    const role = form.get("role") as string

    if (userId === currentUser.id) {
      return { error: "You cannot change your own role" }
    }

    if (!ROLES.includes(role as Role)) {
      return { error: "Invalid role" }
    }

    const db = getDb(env)
    await db.update(schema.user).set({ role }).where(eq(schema.user.id, userId))
  }

  return {}
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

type UserRow = {
  id: string
  name: string
  email: string
  image: string | null
  role: string
  chapterId: string | null
  createdAt: Date | null
}

function RoleSelect({ user, currentUserId }: { user: UserRow; currentUserId: string }) {
  const fetcher = useFetcher()
  const { t } = useTranslation()
  const isSelf = user.id === currentUserId

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="updateRole" />
      <input type="hidden" name="userId" value={user.id} />
      <select
        name="role"
        defaultValue={user.role}
        disabled={isSelf}
        onChange={(e) => {
          const form = e.currentTarget.form
          if (form) fetcher.submit(form)
        }}
        className="rounded border border-gray-200 px-2 py-1 text-sm disabled:opacity-50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {isSelf && <span className="ml-2 text-xs text-gray-400">{t("admin.users.you")}</span>}
    </fetcher.Form>
  )
}

export default function AdminUsers() {
  const { users, currentUserId } = useLoaderData<typeof loader>()
  const { t } = useTranslation()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{t("admin.users.heading")}</h1>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">
                {t("admin.users.col_user")}
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">
                {t("admin.users.col_email")}
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">
                {t("admin.users.col_role")}
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">
                {t("admin.users.col_chapter")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-500 text-xs font-medium text-white">
                      {u.image ? (
                        <img src={u.image} alt={u.name} className="h-full w-full object-cover" />
                      ) : (
                        (u.name[0]?.toUpperCase() ?? "?")
                      )}
                    </div>
                    <span className="font-medium text-gray-900">{u.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <RoleSelect user={u} currentUserId={currentUserId} />
                </td>
                <td className="px-4 py-3 text-gray-500">{u.chapterId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">{t("admin.users.empty")}</p>
        )}
      </div>
    </div>
  )
}
