import { and, eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { ActionFunctionArgs } from "react-router"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.cloudflare
  const sessionUser = await requireRole(request, env, "viewer")
  const db = getDb(env)

  const form = await request.formData()
  const intent = form.get("intent")

  // -------------------------------------------------------------------------
  // addComment — insert a top-level comment
  // -------------------------------------------------------------------------
  if (intent === "addComment") {
    const pageId = form.get("pageId")
    const contentJson = form.get("contentJson")
    if (typeof pageId !== "string" || !pageId || typeof contentJson !== "string" || !contentJson) {
      return Response.json({ error: "Missing fields" }, { status: 400 })
    }

    const id = nanoid()
    await db.insert(schema.pageComments).values({
      id,
      pageId,
      authorId: sessionUser.id,
      parentId: null,
      contentJson,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    return Response.json({ ok: true, id })
  }

  // -------------------------------------------------------------------------
  // addReply — insert a reply and notify the parent comment author
  // -------------------------------------------------------------------------
  if (intent === "addReply") {
    const parentCommentId = form.get("parentCommentId")
    const pageId = form.get("pageId")
    const pageSlug = form.get("pageSlug")
    const contentJson = form.get("contentJson")
    if (
      typeof parentCommentId !== "string" ||
      !parentCommentId ||
      typeof pageId !== "string" ||
      !pageId ||
      typeof pageSlug !== "string" ||
      !pageSlug ||
      typeof contentJson !== "string" ||
      !contentJson
    ) {
      return Response.json({ error: "Missing fields" }, { status: 400 })
    }

    const parentComment = await db
      .select({ id: schema.pageComments.id, authorId: schema.pageComments.authorId })
      .from(schema.pageComments)
      .where(eq(schema.pageComments.id, parentCommentId))
      .get()

    if (!parentComment) {
      return Response.json({ error: "Parent comment not found" }, { status: 404 })
    }

    const id = nanoid()
    await db.insert(schema.pageComments).values({
      id,
      pageId,
      authorId: sessionUser.id,
      parentId: parentCommentId,
      contentJson,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Notify the parent author (skip if replying to own comment)
    if (parentComment.authorId !== sessionUser.id) {
      await db.insert(schema.notifications).values({
        id: nanoid(),
        userId: parentComment.authorId,
        type: "comment_reply",
        titleJa: `${sessionUser.name} さんがコメントに返信しました`,
        titleEn: `${sessionUser.name} replied to your comment`,
        refId: id,
        refUrl: `/wiki/${pageSlug}#comment-${parentCommentId}`,
        createdAt: new Date(),
      })
    }

    return Response.json({ ok: true, id })
  }

  // -------------------------------------------------------------------------
  // deleteComment — soft-delete (set deleted_at)
  // -------------------------------------------------------------------------
  if (intent === "deleteComment") {
    const commentId = form.get("commentId")
    if (typeof commentId !== "string" || !commentId) {
      return Response.json({ error: "Missing commentId" }, { status: 400 })
    }

    const comment = await db
      .select({ id: schema.pageComments.id, authorId: schema.pageComments.authorId })
      .from(schema.pageComments)
      .where(eq(schema.pageComments.id, commentId))
      .get()

    if (!comment) {
      return Response.json({ error: "Comment not found" }, { status: 404 })
    }

    if (comment.authorId !== sessionUser.id && sessionUser.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }

    await db
      .update(schema.pageComments)
      .set({ deletedAt: new Date() })
      .where(eq(schema.pageComments.id, commentId))

    return Response.json({ ok: true })
  }

  // -------------------------------------------------------------------------
  // toggleReaction — insert or delete a reaction
  // -------------------------------------------------------------------------
  if (intent === "toggleReaction") {
    const commentId = form.get("commentId")
    const emoji = form.get("emoji")
    if (typeof commentId !== "string" || !commentId || typeof emoji !== "string" || !emoji) {
      return Response.json({ error: "Missing fields" }, { status: 400 })
    }

    const existing = await db
      .select()
      .from(schema.commentReactions)
      .where(
        and(
          eq(schema.commentReactions.commentId, commentId),
          eq(schema.commentReactions.userId, sessionUser.id),
          eq(schema.commentReactions.emoji, emoji),
        ),
      )
      .get()

    if (existing) {
      await db
        .delete(schema.commentReactions)
        .where(
          and(
            eq(schema.commentReactions.commentId, commentId),
            eq(schema.commentReactions.userId, sessionUser.id),
            eq(schema.commentReactions.emoji, emoji),
          ),
        )
    } else {
      await db.insert(schema.commentReactions).values({
        commentId,
        userId: sessionUser.id,
        emoji,
        createdAt: new Date(),
      })
    }

    // Return updated aggregate for this comment
    const reactions = await db
      .select()
      .from(schema.commentReactions)
      .where(eq(schema.commentReactions.commentId, commentId))
      .all()

    return Response.json({ ok: true, reactions })
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 })
}
