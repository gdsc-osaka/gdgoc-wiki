import { and, desc, eq, gt, isNull } from "drizzle-orm"
import { useTranslation } from "react-i18next"
import { Form, useActionData, useFetcher, useLoaderData } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"
import { sendInvitationEmail } from "~/lib/email.server"

const ROLES = ["viewer", "member", "lead", "admin"] as const
type Role = (typeof ROLES)[number]

const INVITE_ROLES = ["viewer", "member", "lead"] as const
type InviteRole = (typeof INVITE_ROLES)[number]

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

  const chapters = await db
    .select({
      id: schema.chapters.id,
      nameEn: schema.chapters.nameEn,
      nameJa: schema.chapters.nameJa,
    })
    .from(schema.chapters)
    .all()

  const now = Math.floor(Date.now() / 1000)
  const pendingInvitations = await db
    .select()
    .from(schema.invitations)
    .where(and(gt(schema.invitations.expiresAt, now), isNull(schema.invitations.acceptedAt)))
    .all()

  return { users, currentUserId: currentUser.id, chapters, pendingInvitations }
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.cloudflare
  const currentUser = await requireRole(request, env, "admin")
  const form = await request.formData()
  const intent = form.get("intent")
  const db = getDb(env)

  if (intent === "updateRole") {
    const userId = form.get("userId") as string
    const role = form.get("role") as string

    if (userId === currentUser.id) {
      return { error: "You cannot change your own role" }
    }

    if (!ROLES.includes(role as Role)) {
      return { error: "Invalid role" }
    }

    await db.update(schema.user).set({ role }).where(eq(schema.user.id, userId))
    return {}
  }

  if (intent === "inviteUser") {
    const email = (form.get("email") as string).trim().toLowerCase()
    const role = form.get("role") as string
    const chapterId = (form.get("chapterId") as string) || null

    if (!email || !email.includes("@")) {
      return { error: "Invalid email address." }
    }

    if (!INVITE_ROLES.includes(role as InviteRole)) {
      return { error: "Invalid role." }
    }

    // If chapterId provided, confirm it exists
    if (chapterId) {
      const chapter = await db
        .select()
        .from(schema.chapters)
        .where(eq(schema.chapters.id, chapterId))
        .get()
      if (!chapter) {
        return { error: "Selected chapter does not exist." }
      }
    }

    // Check no active pending invitation for this email
    const now = Math.floor(Date.now() / 1000)
    const existingInvitation = await db
      .select()
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.email, email),
          gt(schema.invitations.expiresAt, now),
          isNull(schema.invitations.acceptedAt),
        ),
      )
      .get()

    if (existingInvitation) {
      return { error: "A pending invitation already exists for this email." }
    }

    // Get chapter name for email
    const chapter = chapterId
      ? await db.select().from(schema.chapters).where(eq(schema.chapters.id, chapterId)).get()
      : null

    const token = crypto.randomUUID()
    const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 // 7 days

    await db.insert(schema.invitations).values({
      id: crypto.randomUUID(),
      email,
      chapterId: chapterId ?? undefined,
      role,
      invitedBy: currentUser.id,
      token,
      expiresAt,
    })

    await sendInvitationEmail(env, {
      to: email,
      role: role as InviteRole,
      chapterName: chapter?.nameEn ?? "GDGoC Japan",
      siteUrl: env.BETTER_AUTH_URL,
    })

    return { ok: true, invitedEmail: email }
  }

  return {}
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—"
  return new Date(ts * 1000).toLocaleDateString()
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
  const { users, currentUserId, chapters, pendingInvitations } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const { t } = useTranslation()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{t("admin.users.heading")}</h1>

      {/* Flash messages */}
      {"ok" in (actionData ?? {}) && actionData?.ok && "invitedEmail" in (actionData ?? {}) && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {t("admin.users.invite_sent", {
            email: (actionData as { invitedEmail: string }).invitedEmail,
          })}
        </div>
      )}
      {"error" in (actionData ?? {}) && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {(actionData as { error: string }).error}
        </div>
      )}

      {/* Users table */}
      <div className="mb-10 overflow-hidden rounded-lg border border-gray-200 bg-white">
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

      {/* Pending invitations */}
      {pendingInvitations.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            {t("admin.users.pending_heading")}
          </h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">
                    {t("admin.users.col_email")}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">
                    {t("admin.users.col_role")}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">
                    {t("admin.users.col_chapter")}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">
                    {t("admin.users.col_invited_at")}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">
                    {t("admin.users.col_expires_at")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingInvitations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{inv.email}</td>
                    <td className="px-4 py-3 text-gray-500">{inv.role}</td>
                    <td className="px-4 py-3 text-gray-500">{inv.chapterId ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(inv.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(inv.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite form */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {t("admin.users.invite_heading")}
        </h2>
        <Form method="post" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <input type="hidden" name="intent" value="inviteUser" />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">{t("admin.users.form.email")}</span>
            <input
              name="email"
              type="email"
              required
              className="rounded border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">{t("admin.users.form.role")}</span>
            <select
              name="role"
              defaultValue="member"
              className="rounded border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">
              {t("admin.users.form.chapter")}
            </span>
            <select
              name="chapterId"
              className="rounded border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t("admin.users.no_chapter")}</option>
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.nameEn}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-3 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t("admin.users.form.submit")}
            </button>
          </div>
        </Form>
      </div>
    </div>
  )
}
