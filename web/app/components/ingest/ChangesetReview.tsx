import { useState } from "react"
import TipTapEditor from "~/components/TipTapEditor"
import type { AiDraftJson, ChangesetOperation } from "~/lib/ingestion-pipeline.server"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_TYPES = [
  { value: "event-report", label: "イベントレポート" },
  { value: "speaker-profile", label: "スピーカープロファイル" },
  { value: "project-log", label: "プロジェクトログ" },
  { value: "how-to-guide", label: "ハウツーガイド" },
  { value: "onboarding-guide", label: "オンボーディングガイド" },
]

const CANONICAL_TAGS = [
  { slug: "event-operations", label: "イベント運営" },
  { slug: "speaker-management", label: "スピーカー管理" },
  { slug: "sponsor-relations", label: "スポンサー・渉外" },
  { slug: "project", label: "プロジェクト" },
  { slug: "onboarding", label: "新メンバー向け" },
  { slug: "community-ops", label: "コミュニティ運営" },
  { slug: "technical", label: "技術" },
  { slug: "template", label: "テンプレート" },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OperationState {
  title: string
  tiptapJson: string
  summaryJa: string
  pageType: string
  tags: string[]
  pageMetadata: Record<string, string>
}

interface ChangesetReviewProps {
  draft: AiDraftJson
  sessionId: string
  userRole: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChangesetReview({ draft, sessionId, userRole }: ChangesetReviewProps) {
  const [opStates, setOpStates] = useState<OperationState[]>(() =>
    draft.operations.map((op) => initOpState(op)),
  )
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string[]>(draft.operations.map(() => ""))
  const [regenerating, setRegenerating] = useState<boolean[]>(draft.operations.map(() => false))

  function updateOp(idx: number, updates: Partial<OperationState>) {
    setOpStates((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...updates }
      return next
    })
  }

  function toggleTag(idx: number, slug: string) {
    setOpStates((prev) => {
      const next = [...prev]
      const tags = next[idx].tags
      next[idx] = {
        ...next[idx],
        tags: tags.includes(slug) ? tags.filter((t) => t !== slug) : [...tags, slug],
      }
      return next
    })
  }

  async function handleRegenerate(idx: number) {
    setRegenerating((prev) => {
      const n = [...prev]
      n[idx] = true
      return n
    })
    try {
      const res = await fetch(`/api/ingest/${sessionId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationIndex: idx,
          feedback: feedback[idx],
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as { operation: ChangesetOperation }
        setOpStates((prev) => {
          const next = [...prev]
          next[idx] = initOpState(data.operation)
          return next
        })
      }
    } finally {
      setRegenerating((prev) => {
        const n = [...prev]
        n[idx] = false
        return n
      })
    }
  }

  async function handleSubmit(publishStatus: "draft" | "published") {
    setSubmitting(true)
    try {
      const body = {
        publishStatus,
        operations: draft.operations.map((op, idx) => ({
          type: op.type,
          tempId: op.tempId,
          pageId: op.pageId,
          title: opStates[idx].title,
          tiptapJson: opStates[idx].tiptapJson,
          summaryJa: opStates[idx].summaryJa,
          pageType: opStates[idx].pageType,
          pageMetadata: opStates[idx].pageMetadata,
          tags: opStates[idx].tags,
          suggestedParentId: op.draft?.suggestedParentId ?? null,
          actionabilityScore: op.draft?.actionabilityScore ?? op.patch?.actionabilityScore ?? 2,
        })),
      }

      const res = await fetch(`/api/ingest/${sessionId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        window.location.href = "/"
      } else {
        const err = await res.text()
        alert(`エラー: ${err}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const canPublish = userRole === "lead" || userRole === "admin"

  return (
    <div className="space-y-6">
      {/* Plan rationale */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <h3 className="text-sm font-medium text-blue-800">AIの判断理由</h3>
        <p className="mt-1 text-sm text-blue-700">{draft.planRationale}</p>
      </div>

      {/* Warnings */}
      {draft.warnings && draft.warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-100 bg-yellow-50 p-4">
          <h3 className="text-sm font-medium text-yellow-800">注意</h3>
          <ul className="mt-1 list-disc pl-4 text-sm text-yellow-700">
            {draft.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Operation cards */}
      {draft.operations.map((op, idx) => {
        const state = opStates[idx]
        const score = op.draft?.actionabilityScore ?? op.patch?.actionabilityScore
        const notes = op.draft?.actionabilityNotes ?? op.patch?.actionabilityNotes
        const draftMarkdown = op.draft ? buildMarkdownFromDraft(op.draft) : ""
        const opKey = op.tempId ?? op.pageId ?? String(idx)

        return (
          <div key={opKey} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            {/* Op header */}
            <div className="mb-4 flex items-center gap-3">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  op.type === "create" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                }`}
              >
                {op.type === "create" ? "新規作成" : "更新"}
              </span>
              <span className="text-sm text-gray-500">{op.rationale}</span>
            </div>

            {/* Actionability score banner */}
            {score && score < 3 && (
              <div
                className={`mb-4 rounded-lg p-3 text-sm ${
                  score === 1
                    ? "border border-red-200 bg-red-50 text-red-700"
                    : "border border-yellow-200 bg-yellow-50 text-yellow-700"
                }`}
              >
                <strong>
                  アクション可能性スコア: {score}/3
                  {score === 1 && " — 入力を補強して再生成することを推奨します"}
                </strong>
                {notes && <p className="mt-1">{notes}</p>}
              </div>
            )}

            {/* Title */}
            <div className="mb-4">
              <label
                htmlFor={`title-${idx}`}
                className="mb-1 block text-xs font-medium text-gray-600"
              >
                ページタイトル
              </label>
              <input
                id={`title-${idx}`}
                type="text"
                value={state.title}
                onChange={(e) => updateOp(idx, { title: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Summary */}
            <div className="mb-4">
              <label
                htmlFor={`summary-${idx}`}
                className="mb-1 block text-xs font-medium text-gray-600"
              >
                要約
              </label>
              <textarea
                id={`summary-${idx}`}
                value={state.summaryJa}
                onChange={(e) => updateOp(idx, { summaryJa: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Page type */}
            <div className="mb-4">
              <label
                htmlFor={`pagetype-${idx}`}
                className="mb-1 block text-xs font-medium text-gray-600"
              >
                ページタイプ
              </label>
              <select
                id={`pagetype-${idx}`}
                value={state.pageType}
                onChange={(e) => updateOp(idx, { pageType: e.target.value })}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {PAGE_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>
                    {pt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div className="mb-4">
              <p className="mb-1 text-xs font-medium text-gray-600">タグ（最大5つ）</p>
              <div className="flex flex-wrap gap-2">
                {CANONICAL_TAGS.map((tag) => (
                  <button
                    key={tag.slug}
                    type="button"
                    onClick={() => toggleTag(idx, tag.slug)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      state.tags.includes(tag.slug)
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Editor */}
            <div className="mb-4">
              <p className="mb-1 text-xs font-medium text-gray-600">本文</p>
              <TipTapEditor
                initialMarkdown={draftMarkdown}
                onChange={(json) => updateOp(idx, { tiptapJson: json })}
              />
            </div>

            {/* Regenerate */}
            <div className="mt-4 border-t border-gray-100 pt-4">
              <label
                htmlFor={`feedback-${idx}`}
                className="mb-1 block text-xs font-medium text-gray-500"
              >
                再生成フィードバック
              </label>
              <div className="flex gap-2">
                <input
                  id={`feedback-${idx}`}
                  type="text"
                  value={feedback[idx]}
                  onChange={(e) => {
                    const next = [...feedback]
                    next[idx] = e.target.value
                    setFeedback(next)
                  }}
                  placeholder="改善してほしい点を入力..."
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => handleRegenerate(idx)}
                  disabled={regenerating[idx] || !feedback[idx].trim()}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  {regenerating[idx] ? "生成中..." : "再生成"}
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {/* Submit buttons */}
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => handleSubmit("draft")}
          disabled={submitting}
          className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          {submitting ? "保存中..." : "下書きとして保存"}
        </button>
        {canPublish && (
          <button
            type="button"
            onClick={() => handleSubmit("published")}
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "公開中..." : "公開する"}
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initOpState(op: ChangesetOperation): OperationState {
  const draft = op.draft
  return {
    title: draft?.title.ja ?? op.pageTitle ?? "",
    tiptapJson: "",
    summaryJa: draft?.summary.ja ?? "",
    pageType: draft?.suggestedPageType ?? "how-to-guide",
    tags: draft?.suggestedTags ?? [],
    pageMetadata: draft?.metadata ?? {},
  }
}

function buildMarkdownFromDraft(draft: import("~/lib/gemini.server").PageDraft): string {
  return draft.sections.map((section) => `## ${section.heading}\n\n${section.body}`).join("\n\n")
}
