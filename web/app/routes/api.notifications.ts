import { and, eq, notInArray } from "drizzle-orm"
import type { LoaderFunctionArgs } from "react-router"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  const user = await requireRole(request, env, "viewer")
  const db = getDb(env)

  const sessions = await db
    .select({
      id: schema.ingestionSessions.id,
      status: schema.ingestionSessions.status,
      phaseMessage: schema.ingestionSessions.phaseMessage,
      createdAt: schema.ingestionSessions.createdAt,
      updatedAt: schema.ingestionSessions.updatedAt,
    })
    .from(schema.ingestionSessions)
    .where(
      and(
        eq(schema.ingestionSessions.userId, user.id),
        notInArray(schema.ingestionSessions.status, ["archived", "pending"]),
      ),
    )
    .orderBy(schema.ingestionSessions.updatedAt)
    .limit(20)
    .all()

  // Reverse so most recent is first (orderBy desc not available in all D1 builds)
  sessions.reverse()

  return Response.json({ sessions })
}
