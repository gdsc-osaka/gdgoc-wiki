import { and, eq, ne } from "drizzle-orm"
import type { ActionFunctionArgs } from "react-router"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"
import { indexPageEmbeddings } from "~/lib/embedding-pipeline.server"

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.cloudflare
  await requireRole(request, env, "admin")
  const db = getDb(env)

  // Find published pages that need (re-)indexing
  const pendingPages = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .leftJoin(schema.pageEmbeddingStatus, eq(schema.pages.id, schema.pageEmbeddingStatus.pageId))
    .where(
      and(
        eq(schema.pages.status, "published"),
        // Either no embedding status row, or status is not "indexed"
        ne(schema.pageEmbeddingStatus.status, "indexed"),
      ),
    )
    .limit(50)
    .all()

  // Also find pages with no embedding_status row at all
  const missingPages = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .leftJoin(schema.pageEmbeddingStatus, eq(schema.pages.id, schema.pageEmbeddingStatus.pageId))
    .where(
      and(
        eq(schema.pages.status, "published"),
        // pageEmbeddingStatus.pageId is null means no row exists
      ),
    )
    .all()

  const pageIdsToIndex = new Set<string>()
  for (const p of pendingPages) pageIdsToIndex.add(p.id)
  // From missingPages, add those without a status row
  for (const p of missingPages) {
    const hasStatus = await db
      .select({ pageId: schema.pageEmbeddingStatus.pageId })
      .from(schema.pageEmbeddingStatus)
      .where(eq(schema.pageEmbeddingStatus.pageId, p.id))
      .get()
    if (!hasStatus) pageIdsToIndex.add(p.id)
  }

  const pageIds = [...pageIdsToIndex].slice(0, 50)

  let indexed = 0
  let errors = 0

  for (const pageId of pageIds) {
    try {
      await indexPageEmbeddings(env, db, pageId)
      indexed++
    } catch (err) {
      console.error("backfill-embeddings: failed", pageId, err)
      errors++
      // Record error in status
      try {
        const errMsg = err instanceof Error ? err.message : "Unknown error"
        await db
          .insert(schema.pageEmbeddingStatus)
          .values({
            pageId,
            status: "error",
            errorMessage: errMsg,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.pageEmbeddingStatus.pageId,
            set: { status: "error", errorMessage: errMsg, updatedAt: new Date() },
          })
      } catch {
        // best-effort
      }
    }
  }

  // Count remaining
  const remaining = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .leftJoin(schema.pageEmbeddingStatus, eq(schema.pages.id, schema.pageEmbeddingStatus.pageId))
    .where(eq(schema.pages.status, "published"))
    .all()

  const indexedCount = await db
    .select({ pageId: schema.pageEmbeddingStatus.pageId })
    .from(schema.pageEmbeddingStatus)
    .where(eq(schema.pageEmbeddingStatus.status, "indexed"))
    .all()

  const remainingCount = remaining.length - indexedCount.length

  return Response.json({ indexed, errors, remaining: Math.max(0, remainingCount) })
}
