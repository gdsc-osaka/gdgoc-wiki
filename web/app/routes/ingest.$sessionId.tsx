import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useLoaderData } from "react-router"
import type { LoaderFunctionArgs } from "react-router"
import Toast from "~/components/Toast"
import ChangesetReview from "~/components/ingest/ChangesetReview"
import SensitiveReviewModal from "~/components/ingest/SensitiveReviewModal"
import type { ResolvedItem } from "~/components/ingest/SensitiveReviewModal"
import * as schema from "~/db/schema"
import { requireRole } from "~/lib/auth-utils.server"
import type { AiDraftJson } from "~/lib/ingestion-pipeline.server"

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  const user = await requireRole(request, env, "member")
  const db = drizzle(env.DB, { schema })

  const session = await db
    .select()
    .from(schema.ingestionSessions)
    .where(eq(schema.ingestionSessions.id, params.sessionId ?? ""))
    .get()

  if (!session) throw new Response("Not found", { status: 404 })
  if (session.userId !== user.id) throw new Response("Forbidden", { status: 403 })

  return {
    sessionId: session.id,
    status: session.status,
    errorMessage: session.errorMessage,
    draft: (() => {
      if (!session.aiDraftJson) return null
      try {
        return JSON.parse(session.aiDraftJson) as AiDraftJson
      } catch {
        console.error("Failed to parse ai_draft_json for session", params.sessionId)
        return null
      }
    })(),
    userRole: user.role as string,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IngestSessionPage() {
  const loaderData = useLoaderData<typeof loader>()
  const { t } = useTranslation()
  const [status, setStatus] = useState(loaderData.status)
  const [draft, setDraft] = useState(loaderData.draft)
  const [errorMessage, setErrorMessage] = useState(loaderData.errorMessage)
  const [sensitiveResolved, setSensitiveResolved] = useState(false)
  const [resolvedDraft, setResolvedDraft] = useState<AiDraftJson | null>(null)
  const [showToast, setShowToast] = useState(false)

  // Poll status every 2s while processing
  useEffect(() => {
    if (status !== "processing") return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ingest/${loaderData.sessionId}/status`)
        if (!res.ok) return
        const data = (await res.json()) as { status: string; errorMessage: string | null }
        setStatus(data.status)
        if (data.errorMessage) setErrorMessage(data.errorMessage)
        if (data.status === "done") {
          sessionStorage.setItem(`ingest-done-${loaderData.sessionId}`, "1")
          window.location.reload()
        }
      } catch {
        // ignore network errors during polling
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [status, loaderData.sessionId])

  // Show toast after reload when ingestion completes
  useEffect(() => {
    const key = `ingest-done-${loaderData.sessionId}`
    if (sessionStorage.getItem(key)) {
      sessionStorage.removeItem(key)
      setShowToast(true)
    }
  }, [loaderData.sessionId])

  // Processing state
  if (status === "processing") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        <div className="text-center">
          <p className="text-lg font-medium text-gray-800">{t("ingest.processing_message")}</p>
          <p className="mt-1 text-sm text-gray-500">{t("ingest.processing_hint")}</p>
        </div>
      </div>
    )
  }

  // Error state
  if (status === "error") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="mb-4 text-4xl">⚠️</div>
        <h1 className="text-lg font-semibold text-gray-900">{t("ingest.error_heading")}</h1>
        {errorMessage && <p className="mt-2 text-sm text-gray-500">{errorMessage}</p>}
        <a
          href="/ingest"
          className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t("ingest.retry")}
        </a>
      </div>
    )
  }

  // Done — show review
  if (!draft) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-gray-500">{t("ingest.draft_not_found")}</p>
      </div>
    )
  }

  // Apply sensitive item resolutions and proceed to changeset review
  function handleSensitiveResolved(resolutions: ResolvedItem[]) {
    if (!draft) return
    const updatedDraft = applySensitiveResolutions(draft, resolutions)
    setResolvedDraft(updatedDraft)
    setSensitiveResolved(true)
  }

  const currentDraft = resolvedDraft ?? draft
  const hasSensitive = draft.sensitiveItems.length > 0

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {showToast && (
        <Toast message={t("ingest.complete_toast")} onDismiss={() => setShowToast(false)} />
      )}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t("ingest.review_heading")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("ingest.review_subtitle")}</p>
      </div>

      {hasSensitive && !sensitiveResolved && (
        <SensitiveReviewModal items={draft.sensitiveItems} onProceed={handleSensitiveResolved} />
      )}

      <ChangesetReview
        draft={currentDraft}
        sessionId={loaderData.sessionId}
        userRole={loaderData.userRole}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Apply sensitive resolutions to draft
// ---------------------------------------------------------------------------

function walkStrings(value: unknown, from: string, to: string): unknown {
  if (typeof value === "string") return value.split(from).join(to)
  if (Array.isArray(value)) return value.map((v) => walkStrings(v, from, to))
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        walkStrings(v, from, to),
      ]),
    )
  }
  return value
}

function applySensitiveResolutions(draft: AiDraftJson, resolutions: ResolvedItem[]): AiDraftJson {
  let result: unknown = draft
  for (const { item, resolution } of resolutions) {
    if (resolution === "delete") {
      result = walkStrings(result, item.excerpt, "")
    } else if (resolution === "replace") {
      result = walkStrings(result, item.excerpt, "[要確認]")
    }
    // "keep" — do nothing
  }
  return result as AiDraftJson
}
