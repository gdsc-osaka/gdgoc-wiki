import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { nanoid } from "nanoid"
import type { ActionFunctionArgs } from "react-router"
import { z } from "zod"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { generateSlug } from "~/lib/ingestion-pipeline.server"

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const CommitOperationSchema = z.object({
  type: z.enum(["create", "update"]),
  tempId: z.string().optional(),
  pageId: z.string().optional(),
  title: z.string().min(1),
  tiptapJson: z.string(),
  summaryJa: z.string(),
  pageType: z.string(),
  pageMetadata: z.record(z.string(), z.string()).default({}),
  tags: z.array(z.string()).max(5).default([]),
  suggestedParentId: z.string().nullable().optional(),
  actionabilityScore: z.number(),
})

const CommitBodySchema = z.object({
  publishStatus: z.enum(["draft", "published"]),
  operations: z.array(CommitOperationSchema).min(1),
})

type CommitBody = z.infer<typeof CommitBodySchema>

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

  const parseResult = CommitBodySchema.safeParse(await request.json())
  if (!parseResult.success) {
    return new Response(parseResult.error.message, { status: 400 })
  }
  const body: CommitBody = parseResult.data

  // Members can only save as draft
  const userRole = user.role as string
  const canPublish = userRole === "lead" || userRole === "admin"
  const publishStatus = canPublish ? body.publishStatus : "draft"

  const now = new Date()
  const pageIds: string[] = []
  const translationPageIds: string[] = []

  // Execute atomically using D1 batch
  const statements = []

  for (const op of body.operations) {
    if (op.type === "create") {
      const pageId = nanoid()
      pageIds.push(pageId)

      // Generate a unique slug by checking for collisions
      let slug = generateSlug(op.title) || nanoid(8)
      const collision = await db
        .select({ id: schema.pages.id })
        .from(schema.pages)
        .where(eq(schema.pages.slug, slug))
        .get()
      if (collision) slug = `${slug}-${nanoid(6)}`

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

      if (publishStatus === "published") {
        translationPageIds.push(pageId)
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

      if (publishStatus === "published") {
        translationPageIds.push(op.pageId)
      }
    }
  }

  // Archive session
  statements.push(
    env.DB.prepare(
      `UPDATE ingestion_sessions SET status = 'archived', updated_at = unixepoch() WHERE id = ?`,
    ).bind(params.sessionId),
  )

  // Run all statements atomically — send translation jobs only after success
  await env.DB.batch(statements)

  for (const pid of translationPageIds) {
    await env.TRANSLATION_QUEUE.send({ pageId: pid })
  }

  return Response.json({ pageIds })
}
