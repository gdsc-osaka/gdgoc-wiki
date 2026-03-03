import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { nanoid } from "nanoid"
import type { ActionFunctionArgs } from "react-router"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { generateSlug } from "~/lib/ingestion-pipeline.server"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommitOperation {
  type: "create" | "update"
  tempId?: string
  pageId?: string
  title: string
  tiptapJson: string
  summaryJa: string
  pageType: string
  pageMetadata: Record<string, string>
  tags: string[]
  suggestedParentId?: string | null
  actionabilityScore: number
}

interface CommitBody {
  publishStatus: "draft" | "published"
  operations: CommitOperation[]
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action({ request, context, params }: ActionFunctionArgs) {
  const { env } = context.cloudflare
  const user = await requireRole(request, env, "member")
  const db = drizzle(env.DB, { schema })

  // Verify session ownership
  const session = await db
    .select({ userId: schema.ingestionSessions.userId })
    .from(schema.ingestionSessions)
    .where(eq(schema.ingestionSessions.id, params.sessionId ?? ""))
    .get()

  if (!session) throw new Response("Not found", { status: 404 })
  if (session.userId !== user.id) throw new Response("Forbidden", { status: 403 })

  const body = (await request.json()) as CommitBody

  // Members can only save as draft
  const userRole = user.role as string
  const canPublish = userRole === "lead" || userRole === "admin"
  const publishStatus = canPublish ? body.publishStatus : "draft"

  const now = new Date()
  const pageIds: string[] = []

  // Execute atomically using D1 batch
  const statements = []

  for (const op of body.operations) {
    if (op.type === "create") {
      const pageId = nanoid()
      pageIds.push(pageId)

      const slug = generateSlug(op.title)
      const metadata = JSON.stringify(op.pageMetadata ?? {})

      statements.push(
        env.DB.prepare(
          `INSERT INTO pages (id, title_ja, slug, content_ja, summary_ja, page_type, page_metadata,
            ingestion_session_id, actionability_score, author_id, last_edited_by,
            status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
        ).bind(
          pageId,
          op.title,
          slug,
          op.tiptapJson,
          op.summaryJa,
          op.pageType,
          metadata,
          params.sessionId,
          op.actionabilityScore,
          user.id,
          user.id,
          publishStatus,
        ),
      )

      // Insert tags
      for (const tagSlug of op.tags ?? []) {
        statements.push(
          env.DB.prepare("INSERT OR IGNORE INTO page_tags (page_id, tag_slug) VALUES (?, ?)").bind(
            pageId,
            tagSlug,
          ),
        )
      }

      // Enqueue translation job if publishing
      if (publishStatus === "published") {
        await env.TRANSLATION_QUEUE.send({ pageId })
      }
    } else if (op.type === "update" && op.pageId) {
      pageIds.push(op.pageId)

      // Fetch existing content for version snapshot
      const existing = await db
        .select({
          contentJa: schema.pages.contentJa,
          contentEn: schema.pages.contentEn,
          titleJa: schema.pages.titleJa,
          titleEn: schema.pages.titleEn,
        })
        .from(schema.pages)
        .where(eq(schema.pages.id, op.pageId))
        .get()

      if (existing) {
        const versionId = nanoid()
        // Save version snapshot
        statements.push(
          env.DB.prepare(
            `INSERT INTO page_versions (id, page_id, content_ja, content_en, title_ja, title_en, edited_by, saved_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())`,
          ).bind(
            versionId,
            op.pageId,
            existing.contentJa,
            existing.contentEn,
            existing.titleJa,
            existing.titleEn,
            user.id,
          ),
        )
      }

      // Apply patch
      statements.push(
        env.DB.prepare(
          `UPDATE pages SET content_ja = ?, title_ja = ?, summary_ja = ?, ingestion_session_id = ?,
            last_edited_by = ?, updated_at = unixepoch()
           WHERE id = ?`,
        ).bind(op.tiptapJson, op.title, op.summaryJa, params.sessionId, user.id, op.pageId),
      )

      // Enqueue translation job if publishing
      if (publishStatus === "published") {
        await env.TRANSLATION_QUEUE.send({ pageId: op.pageId })
      }
    }
  }

  // Archive session
  statements.push(
    env.DB.prepare(
      `UPDATE ingestion_sessions SET status = 'archived', updated_at = unixepoch() WHERE id = ?`,
    ).bind(params.sessionId),
  )

  // Run all statements atomically
  await env.DB.batch(statements)

  return Response.json({ pageIds })
}
