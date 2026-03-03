import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import type { ActionFunctionArgs } from "react-router"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import {
  type CreateOperation,
  type UpdateOperation,
  buildFeedbackSuffix,
  runPhase2Creator,
  runPhase2Patcher,
} from "~/lib/gemini.server"
import {
  type AiDraftJson,
  type ChangesetOperation,
  buildPageIndex,
} from "~/lib/ingestion-pipeline.server"
import { tiptapToMarkdown } from "~/lib/tiptap-convert.server"

export async function action({ request, context, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  const { env } = context.cloudflare
  const user = await requireRole(request, env, "member")
  const db = drizzle(env.DB, { schema })

  const session = await db
    .select({
      userId: schema.ingestionSessions.userId,
      aiDraftJson: schema.ingestionSessions.aiDraftJson,
      inputsJson: schema.ingestionSessions.inputsJson,
      status: schema.ingestionSessions.status,
    })
    .from(schema.ingestionSessions)
    .where(eq(schema.ingestionSessions.id, params.sessionId ?? ""))
    .get()

  if (!session) return new Response("Not found", { status: 404 })
  if (session.userId !== user.id) return new Response("Forbidden", { status: 403 })
  if (session.status !== "done") return new Response("Session not complete", { status: 409 })

  const body = (await request.json()) as { operationIndex: number; feedback?: string }
  const { operationIndex, feedback } = body

  const draft = JSON.parse(session.aiDraftJson ?? "null") as AiDraftJson | null
  if (!draft) return new Response("No draft found", { status: 404 })

  const op = draft.operations[operationIndex]
  if (!op) return new Response("Operation not found", { status: 404 })

  const inputs = JSON.parse(session.inputsJson ?? "{}") as { texts?: string[] }
  const userText = (inputs.texts ?? []).join("\n\n")
  const feedbackSuffix = feedback ? buildFeedbackSuffix(feedback) : ""
  const userTextWithFeedback = userText + feedbackSuffix

  // No file URIs for regeneration — Gemini File API URIs are ephemeral
  const fileUris: { uri: string; mimeType: string }[] = []

  let updatedOp: ChangesetOperation

  if (op.type === "create" && op.draft) {
    const createOp: CreateOperation = {
      type: "create",
      tempId: op.tempId ?? "",
      suggestedTitle: { ja: op.draft.title.ja },
      suggestedParentId: op.draft.suggestedParentId ?? null,
      pageType: op.draft.suggestedPageType,
      rationale: op.rationale,
    }
    const pageIndex = await buildPageIndex(db, userTextWithFeedback)
    const newDraft = await runPhase2Creator(
      env.GEMINI_API_KEY,
      userTextWithFeedback,
      fileUris,
      createOp,
      pageIndex,
    )
    updatedOp = { ...op, draft: newDraft }
  } else if (op.type === "update" && op.patch) {
    const updateOp: UpdateOperation = {
      type: "update",
      pageId: op.pageId ?? "",
      pageTitle: op.pageTitle ?? "",
      rationale: op.rationale,
    }
    const existingMarkdown = tiptapToMarkdown(op.existingTipTapJson ?? "")
    const newPatch = await runPhase2Patcher(
      env.GEMINI_API_KEY,
      userTextWithFeedback,
      fileUris,
      updateOp,
      existingMarkdown,
    )
    updatedOp = { ...op, patch: newPatch }
  } else {
    return new Response("Cannot regenerate this operation type", { status: 400 })
  }

  // Update the draft in DB
  const updatedOps = [...draft.operations]
  updatedOps[operationIndex] = updatedOp
  const updatedDraft: AiDraftJson = { ...draft, operations: updatedOps }

  await db
    .update(schema.ingestionSessions)
    .set({ aiDraftJson: JSON.stringify(updatedDraft) })
    .where(eq(schema.ingestionSessions.id, params.sessionId ?? ""))

  return Response.json({ operation: updatedOp })
}
