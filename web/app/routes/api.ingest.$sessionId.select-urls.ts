import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import type { ActionFunctionArgs } from "react-router"
import { z } from "zod"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import type { AiDraftJson, IngestionInputs } from "~/lib/ingestion-pipeline.server"
import { runIngestionPipeline } from "~/lib/ingestion-pipeline.server"

const SelectUrlsBodySchema = z.object({
  selectedUrls: z.array(z.string().url()).max(5),
})

export async function action({ request, context, params }: ActionFunctionArgs) {
  const { env, ctx } = context.cloudflare
  const user = await requireRole(request, env, "member")
  const db = drizzle(env.DB, { schema })

  const session = await db
    .select()
    .from(schema.ingestionSessions)
    .where(eq(schema.ingestionSessions.id, params.sessionId ?? ""))
    .get()

  if (!session) throw new Response("Not found", { status: 404 })
  if (session.userId !== user.id) throw new Response("Forbidden", { status: 403 })
  if (session.status !== "awaiting_url_selection") {
    return new Response("Session is not awaiting URL selection", { status: 409 })
  }

  let parseResult: ReturnType<typeof SelectUrlsBodySchema.safeParse>
  try {
    const body = await request.json()
    parseResult = SelectUrlsBodySchema.safeParse(body)
  } catch (err) {
    return new Response(String((err as Error)?.message ?? "Invalid JSON"), { status: 400 })
  }
  if (!parseResult.success) {
    return new Response(parseResult.error.message, { status: 400 })
  }
  const { selectedUrls } = parseResult.data

  // Recover stored URL selection data
  let storedDraft: AiDraftJson | null = null
  try {
    storedDraft = session.aiDraftJson ? (JSON.parse(session.aiDraftJson) as AiDraftJson) : null
  } catch {
    return new Response("Failed to parse stored draft", { status: 500 })
  }

  if (!storedDraft || storedDraft.phase !== "url_selection") {
    return new Response("Invalid stored draft state", { status: 500 })
  }

  // Validate that every selected URL was in the pipeline-extracted whitelist
  const whitelistedUrls = new Set(storedDraft.urls.map((u) => u.url))
  const invalidUrls = selectedUrls.filter((url) => !whitelistedUrls.has(url))
  if (invalidUrls.length > 0) {
    return new Response("Selected URLs are not in the allowed list", { status: 400 })
  }

  const fileUris = storedDraft.fileUris
  const googleDocText = storedDraft.googleDocText ?? ""

  // Reconstruct inputs from inputsJson
  let inputs: IngestionInputs
  try {
    const parsed = JSON.parse(session.inputsJson) as {
      texts: string[]
      imageKeys: string[]
      googleDocUrls: string[]
    }
    inputs = {
      texts: parsed.texts,
      imageKeys: parsed.imageKeys,
      googleDocUrls: [], // skip re-upload; fileUris already stored
    }
  } catch {
    return new Response("Failed to parse session inputs", { status: 500 })
  }

  // Transition status back to processing
  await db
    .update(schema.ingestionSessions)
    .set({
      status: "processing",
      aiDraftJson: null,
      phaseMessage: "fetching_urls",
      updatedAt: new Date(),
    })
    .where(eq(schema.ingestionSessions.id, session.id))

  ctx.waitUntil(
    runIngestionPipeline(env, session.id, user.id, inputs, {
      fileUris,
      clarificationAnswers: "",
      googleDocText,
      selectedUrls,
    }),
  )

  return Response.json({ ok: true })
}
