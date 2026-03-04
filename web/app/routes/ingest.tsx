import { eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { nanoid } from "nanoid"
import { redirect } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"
import InputPanel from "~/components/ingest/InputPanel"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import { type IngestionInputs, runIngestionPipeline } from "~/lib/ingestion-pipeline.server"

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  const user = await requireRole(request, env, "member")
  const db = drizzle(env.DB, { schema })

  const driveToken = await db
    .select({ userId: schema.googleDriveTokens.userId })
    .from(schema.googleDriveTokens)
    .where(eq(schema.googleDriveTokens.userId, user.id))
    .get()

  // Count published pages for display
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.pages)
    .where(eq(schema.pages.status, "published"))
    .get()

  return {
    driveConnected: !!driveToken,
    pageCount: countResult?.count ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

const MAX_IMAGES = 5
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
const MIN_TEXT_LENGTH = 50

export async function action({ request, context }: ActionFunctionArgs) {
  const { env, ctx } = context.cloudflare
  const user = await requireRole(request, env, "member")
  const db = drizzle(env.DB, { schema })

  const formData = await request.formData()
  const text = String(formData.get("text") ?? "").trim()
  const googleDocUrl = String(formData.get("googleDocUrl") ?? "").trim()

  // Validate text
  if (text.length < MIN_TEXT_LENGTH) {
    return { error: `入力が少なすぎます。最低${MIN_TEXT_LENGTH}文字以上入力してください。` }
  }

  // Collect image files
  const imageEntries = formData.getAll("images")
  const imageFiles: Array<{ key: string; buffer: ArrayBuffer; mimeType: string; name: string }> = []

  if (imageEntries.length > MAX_IMAGES) {
    return { error: `画像は最大${MAX_IMAGES}枚までです。` }
  }

  const sessionId = nanoid()

  for (const entry of imageEntries) {
    if (!(entry instanceof File) || entry.size === 0) continue
    if (entry.size > MAX_IMAGE_SIZE) {
      return { error: `${entry.name} は10MBを超えています。` }
    }
    const buffer = await entry.arrayBuffer()
    const key = `ingestion/${user.id}/${sessionId}/${entry.name}`
    // Store in R2
    await env.BUCKET.put(key, buffer, { httpMetadata: { contentType: entry.type } })
    imageFiles.push({ key, buffer, mimeType: entry.type, name: entry.name })
  }

  // Build inputs
  const inputs: IngestionInputs = {
    texts: [text],
    imageKeys: imageFiles.map((f) => f.key),
    googleDocUrls: googleDocUrl ? [googleDocUrl] : [],
    imageFiles,
  }

  // Create session row
  await db.insert(schema.ingestionSessions).values({
    id: sessionId,
    userId: user.id,
    status: "processing",
    inputsJson: JSON.stringify({
      texts: inputs.texts,
      imageKeys: inputs.imageKeys,
      googleDocUrls: inputs.googleDocUrls,
    }),
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  // Run pipeline in background
  ctx.waitUntil(runIngestionPipeline(env, sessionId, user.id, inputs))

  throw redirect(`/ingest/${sessionId}`)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IngestPage() {
  // useLoaderData not directly available here — pass via parent or use Form
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">コンテンツを追加する</h1>
        <p className="mt-1 text-sm text-gray-500">
          テキスト・画像・Google ドキュメントをもとに、AIがWikiページの下書きを作成します。
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <IngestForm />
      </div>
    </div>
  )
}

function IngestForm() {
  const { driveConnected } = useLoaderData()
  return <InputPanel driveConnected={driveConnected} />
}

// Inline import to keep component colocated
import { useLoaderData } from "react-router"
