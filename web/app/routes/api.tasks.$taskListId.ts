import { and, eq, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"

// ---------------------------------------------------------------------------
// GET — list tasks for a task list
// ---------------------------------------------------------------------------
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  await requireRole(request, env, "member")
  const db = getDb(env)

  const { taskListId } = params
  if (!taskListId) return Response.json({ error: "Missing taskListId" }, { status: 400 })

  const tasks = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.taskListId, taskListId))
    .orderBy(schema.tasks.sortOrder)
    .all()

  const teams = await db
    .select()
    .from(schema.taskListTeams)
    .where(eq(schema.taskListTeams.taskListId, taskListId))
    .orderBy(schema.taskListTeams.sortOrder)
    .all()

  const deps = await db.select().from(schema.taskDependencies).all()

  return Response.json({ tasks, teams, deps })
}

// ---------------------------------------------------------------------------
// POST — create a new task
// ---------------------------------------------------------------------------
export async function action({ request, params, context }: ActionFunctionArgs) {
  const { env } = context.cloudflare
  const user = await requireRole(request, env, "member")
  const db = getDb(env)

  const { taskListId } = params
  if (!taskListId) return Response.json({ error: "Missing taskListId" }, { status: 400 })

  const body = await request.json()
  const { title, description, status, type, dueDate, assigneeId, teamId, dependencies } = body as {
    title?: string
    description?: string
    status?: string
    type?: string
    dueDate?: string
    assigneeId?: string
    teamId?: string
    dependencies?: string[]
  }

  if (!title) {
    return Response.json({ error: "Title is required" }, { status: 400 })
  }

  // Get and increment the next task number atomically
  const taskList = await db
    .select({ nextTaskNumber: schema.taskLists.nextTaskNumber })
    .from(schema.taskLists)
    .where(eq(schema.taskLists.pageId, taskListId))
    .get()

  if (!taskList) {
    return Response.json({ error: "Task list not found" }, { status: 404 })
  }

  const taskNumber = taskList.nextTaskNumber
  const taskId = nanoid()

  // Get max sort order for this list
  const maxSort = await db
    .select({ max: sql<number>`coalesce(max(sort_order), -1)` })
    .from(schema.tasks)
    .where(eq(schema.tasks.taskListId, taskListId))
    .get()

  const depIds = Array.isArray(dependencies) ? dependencies : []

  await db.batch([
    db.insert(schema.tasks).values({
      id: taskId,
      taskListId,
      number: taskNumber,
      title,
      description: description ?? "",
      status: status ?? "todo",
      type: type ?? "task",
      dueDate: dueDate ?? null,
      assigneeId: assigneeId ?? null,
      teamId: teamId ?? null,
      createdBy: user.id,
      sortOrder: (maxSort?.max ?? -1) + 1,
    }),
    db
      .update(schema.taskLists)
      .set({ nextTaskNumber: taskNumber + 1 })
      .where(eq(schema.taskLists.pageId, taskListId)),
    ...depIds.map((depId) =>
      db.insert(schema.taskDependencies).values({ taskId, dependsOnTaskId: depId }),
    ),
  ])

  return Response.json({ ok: true, id: taskId, number: taskNumber })
}
