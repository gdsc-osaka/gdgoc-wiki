import { and, eq, inArray } from "drizzle-orm"
import { CalendarDays, Check, LayoutList, ListChecks, Pencil, X } from "lucide-react"
import { type ReactNode, useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useFetcher, useLoaderData, useRevalidator } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router"
import DropdownMenu, { type DropdownOption } from "~/components/tasks/DropdownMenu"
import TaskRemainingView from "~/components/tasks/TaskRemainingView"
import TaskTableView from "~/components/tasks/TaskTableView"
import TaskTimelineView from "~/components/tasks/TaskTimelineView"
import * as schema from "~/db/schema"
import { hasRole, requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"
import { buildVisibilityFilter, canUserSeePage } from "~/lib/page-visibility.server"

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `${data.page.titleJa || data.page.titleEn} — GDGoC Japan Wiki` : "Tasks" },
]

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  const user = await requireRole(request, env, "member")
  const db = getDb(env)

  const { slug } = params
  if (!slug) throw new Response("Not found", { status: 404 })

  const page = await db
    .select()
    .from(schema.pages)
    .where(and(eq(schema.pages.slug, slug), eq(schema.pages.pageType, "task-list")))
    .get()

  if (!page) throw new Response("Not found", { status: 404 })

  if (!canUserSeePage(user, page)) {
    throw new Response("Forbidden", { status: 403 })
  }

  const taskListMeta = await db
    .select()
    .from(schema.taskLists)
    .where(eq(schema.taskLists.pageId, page.id))
    .get()

  if (!taskListMeta) throw new Response("Not found", { status: 404 })

  const tasks = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.taskListId, page.id))
    .orderBy(schema.tasks.sortOrder)
    .all()

  const teams = await db
    .select()
    .from(schema.taskListTeams)
    .where(eq(schema.taskListTeams.taskListId, page.id))
    .orderBy(schema.taskListTeams.sortOrder)
    .all()

  // Get dependencies for all tasks in this list
  const taskIds = tasks.map((t) => t.id)
  const deps =
    taskIds.length > 0
      ? await db
          .select()
          .from(schema.taskDependencies)
          .where(inArray(schema.taskDependencies.taskId, taskIds))
          .all()
      : []

  // Build dependency map
  const depMap = new Map<string, string[]>()
  for (const d of deps) {
    const list = depMap.get(d.taskId) || []
    list.push(d.dependsOnTaskId)
    depMap.set(d.taskId, list)
  }

  // Get chapter members for assignee list
  const members = user.chapterId
    ? await db
        .select({ id: schema.user.id, name: schema.user.name, image: schema.user.image })
        .from(schema.user)
        .where(eq(schema.user.chapterId, user.chapterId))
        .all()
    : await db
        .select({ id: schema.user.id, name: schema.user.name, image: schema.user.image })
        .from(schema.user)
        .all()

  const canManage =
    hasRole(user.role as string, "admin") ||
    hasRole(user.role as string, "lead") ||
    user.id === page.authorId

  return {
    page,
    tasks: tasks.map((t) => ({
      ...t,
      dependencies: depMap.get(t.id) || [],
    })),
    teams,
    members,
    taskListId: page.id,
    canManage,
    canChangeVisibility: hasRole(user.role as string, "lead"),
    userId: user.id,
    nextTaskNumber: taskListMeta.nextTaskNumber,
  }
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action({ request, params, context }: ActionFunctionArgs) {
  const { env } = context.cloudflare
  const user = await requireRole(request, env, "member")
  const db = getDb(env)

  const { slug } = params
  if (!slug) throw new Response("Not found", { status: 404 })

  const page = await db
    .select()
    .from(schema.pages)
    .where(and(eq(schema.pages.slug, slug), eq(schema.pages.pageType, "task-list")))
    .get()

  if (!page) throw new Response("Not found", { status: 404 })

  const canManage =
    hasRole(user.role as string, "admin") ||
    hasRole(user.role as string, "lead") ||
    user.id === page.authorId

  if (!canManage) throw new Response("Forbidden", { status: 403 })

  const formData = await request.formData()
  const intent = formData.get("intent") as string

  if (intent === "updateSettings") {
    const titleJa = (formData.get("titleJa") as string) ?? page.titleJa
    const titleEn = (formData.get("titleEn") as string) ?? page.titleEn
    const visibility = (formData.get("visibility") as string) ?? page.visibility

    await db
      .update(schema.pages)
      .set({ titleJa, titleEn, visibility, updatedAt: new Date() })
      .where(eq(schema.pages.id, page.id))

    return { ok: true }
  }

  if (intent === "setVisibility") {
    if (!hasRole(user.role as string, "lead")) throw new Response("Forbidden", { status: 403 })
    const visibility = (formData.get("visibility") as string) ?? page.visibility

    await db
      .update(schema.pages)
      .set({ visibility, updatedAt: new Date() })
      .where(eq(schema.pages.id, page.id))

    return { ok: true }
  }

  throw new Response("Bad request", { status: 400 })
}

// ---------------------------------------------------------------------------
// Route component
// ---------------------------------------------------------------------------

type ViewTab = "table" | "timeline" | "remaining"

export default function TaskListView() {
  const {
    page,
    tasks,
    teams,
    members,
    taskListId,
    canManage,
    canChangeVisibility,
    nextTaskNumber,
  } = useLoaderData<typeof loader>()
  const { t, i18n } = useTranslation()
  const revalidator = useRevalidator()
  const settingsFetcher = useFetcher<{ ok: boolean }>()
  const visibilityFetcher = useFetcher<{ ok: boolean }>()
  const [activeTab, setActiveTab] = useState<ViewTab>("table")

  // Single lang state: controls both view-mode title and edit-mode input
  const initialLang = i18n.language === "en" ? "en" : "ja"
  const [displayLang, setDisplayLang] = useState<"ja" | "en">(initialLang)

  // Inline edit state
  const [editMode, setEditMode] = useState(false)
  const [editTitleJa, setEditTitleJa] = useState(page.titleJa)
  const [editTitleEn, setEditTitleEn] = useState(page.titleEn)

  // Single visibility state: used by the always-visible dropdown
  const [currentVisibility, setCurrentVisibility] = useState(page.visibility)

  // Sync visibility with reloaded page data (when not editing)
  // biome-ignore lint/correctness/useExhaustiveDependencies: editMode intentionally omitted
  useEffect(() => {
    if (!editMode) setCurrentVisibility(page.visibility)
  }, [page.visibility])

  // Exit edit mode when save succeeds; revalidate to refresh page data
  useEffect(() => {
    if (settingsFetcher.data?.ok) {
      setEditMode(false)
      revalidator.revalidate()
    }
  }, [settingsFetcher.data, revalidator])

  // Revalidate after immediate visibility change
  useEffect(() => {
    if (visibilityFetcher.data?.ok) {
      revalidator.revalidate()
    }
  }, [visibilityFetcher.data, revalidator])

  const title = displayLang === "en" ? page.titleEn || page.titleJa : page.titleJa || page.titleEn

  function handleEditStart() {
    setEditTitleJa(page.titleJa)
    setEditTitleEn(page.titleEn)
    setEditMode(true)
  }

  function handleEditCancel() {
    setEditMode(false)
  }

  function handleSave() {
    const fd = new FormData()
    fd.set("intent", "updateSettings")
    fd.set("titleJa", editTitleJa)
    fd.set("titleEn", editTitleEn)
    fd.set("visibility", currentVisibility)
    settingsFetcher.submit(fd, { method: "post" })
  }

  function handleVisibilityChange(val: string) {
    setCurrentVisibility(val)
    if (!editMode) {
      const fd = new FormData()
      fd.set("intent", "setVisibility")
      fd.set("visibility", val)
      visibilityFetcher.submit(fd, { method: "post" })
    }
  }

  const handleUpdate = useCallback(
    async (taskId: string, field: string, value: unknown) => {
      await fetch(`/api/tasks/${taskListId}/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      revalidator.revalidate()
    },
    [taskListId, revalidator],
  )

  const handleCreate = useCallback(
    async (data: {
      title: string
      description: string
      status: string
      type: string
      dueDate: string | null
      assigneeId: string | null
      teamId: string | null
      dependencies: string[]
    }) => {
      await fetch(`/api/tasks/${taskListId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      revalidator.revalidate()
    },
    [taskListId, revalidator],
  )

  const handleDelete = useCallback(
    async (taskId: string) => {
      await fetch(`/api/tasks/${taskListId}/${taskId}`, { method: "DELETE" })
      revalidator.revalidate()
    },
    [taskListId, revalidator],
  )

  const handleTaskClick = useCallback((_taskId: string) => {}, [])

  const tabs: { key: ViewTab; label: string; icon: ReactNode }[] = [
    { key: "table", label: t("tasks.view_table"), icon: <LayoutList size={14} /> },
    { key: "timeline", label: t("tasks.view_timeline"), icon: <CalendarDays size={14} /> },
    { key: "remaining", label: t("tasks.view_remaining"), icon: <ListChecks size={14} /> },
  ]

  const visibilityOptions: DropdownOption[] = [
    { value: "public", label: t("wiki.visibility_public") },
    { value: "private_to_chapter", label: t("wiki.visibility_chapter") },
    { value: "private_to_lead", label: t("wiki.visibility_lead") },
  ]

  return (
    <div>
      <div className="px-4 pt-6 pb-4">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3">
          {/* Left: title or title input */}
          {editMode ? (
            <input
              type="text"
              value={displayLang === "ja" ? editTitleJa : editTitleEn}
              onChange={(e) => {
                if (displayLang === "ja") setEditTitleJa(e.target.value)
                else setEditTitleEn(e.target.value)
              }}
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-xl font-bold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            <h1 className="min-w-0 truncate text-2xl font-bold">{title}</h1>
          )}

          {/* Right: JA|EN pill + visibility + action buttons */}
          <div className="flex shrink-0 items-center gap-2">
            {/* JA|EN — wiki-style pill */}
            <div className="flex gap-1 rounded-md border border-gray-200 bg-white p-0.5">
              {(["ja", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setDisplayLang(l)}
                  className={`min-w-10 rounded px-2 py-1 text-center text-sm font-medium transition-colors ${
                    displayLang === l ? "bg-blue-500 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {l === "ja" ? "JA" : "EN"}
                </button>
              ))}
            </div>

            {/* Visibility: always a dropdown for leads */}
            {canChangeVisibility && (
              <DropdownMenu
                value={currentVisibility}
                options={visibilityOptions}
                onChange={handleVisibilityChange}
                variant="filter"
              />
            )}

            {/* Edit / Save+Cancel */}
            {editMode ? (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Check size={14} />
                  {t("tasks.save")}
                </button>
                <button
                  type="button"
                  onClick={handleEditCancel}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <X size={14} />
                  {t("cancel")}
                </button>
              </>
            ) : (
              canManage && (
                <button
                  type="button"
                  onClick={handleEditStart}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <Pencil size={14} />
                  {t("wiki.edit")}
                </button>
              )
            )}
          </div>
        </div>

        {/* View switcher */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${
                  activeTab === tab.key
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* View content */}
      {activeTab === "table" && (
        <TaskTableView
          tasks={tasks}
          teams={teams}
          members={members}
          onUpdate={handleUpdate}
          onTaskClick={handleTaskClick}
          onCreate={handleCreate}
          onDelete={handleDelete}
          nextTaskNumber={nextTaskNumber}
          canManage={canManage}
          taskListId={taskListId}
          onTeamsRefresh={() => revalidator.revalidate()}
        />
      )}
      {activeTab === "timeline" && (
        <TaskTimelineView tasks={tasks} members={members} onTaskClick={handleTaskClick} />
      )}
      {activeTab === "remaining" && (
        <TaskRemainingView tasks={tasks} members={members} onTaskClick={handleTaskClick} />
      )}
    </div>
  )
}
