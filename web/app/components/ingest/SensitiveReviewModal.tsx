import { useEffect, useState } from "react"
import type { SensitiveItem } from "~/lib/gemini.server"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SensitiveResolution = "keep" | "delete" | "replace"

export interface ResolvedItem {
  item: SensitiveItem
  resolution: SensitiveResolution
}

interface SensitiveReviewModalProps {
  items: SensitiveItem[]
  onProceed: (resolutions: ResolvedItem[]) => void
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  email: "メールアドレス",
  phone: "電話番号",
  "sns-handle": "SNSアカウント",
  financial: "財務情報",
  "personal-opinion": "個人への批評",
  credential: "認証情報",
  other: "その他",
}

const TYPE_COLORS: Record<string, string> = {
  email: "bg-blue-100 text-blue-700",
  phone: "bg-green-100 text-green-700",
  "sns-handle": "bg-blue-100 text-blue-500",
  financial: "bg-yellow-100 text-yellow-700",
  "personal-opinion": "bg-yellow-100 text-yellow-600",
  credential: "bg-red-100 text-red-700",
  other: "bg-gray-100 text-gray-700",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SensitiveReviewModal({ items, onProceed }: SensitiveReviewModalProps) {
  const [resolutions, setResolutions] = useState<Record<string, SensitiveResolution>>(
    Object.fromEntries(items.map((item) => [item.id, "replace" as SensitiveResolution])),
  )

  useEffect(() => {
    setResolutions(
      Object.fromEntries(items.map((item) => [item.id, "replace" as SensitiveResolution])),
    )
  }, [items])

  const allResolved = items.every((item) => resolutions[item.id] !== undefined)

  function setResolution(id: string, resolution: SensitiveResolution) {
    setResolutions((prev) => ({ ...prev, [id]: resolution }))
  }

  function handleProceed() {
    const resolved: ResolvedItem[] = items.map((item) => ({
      item,
      resolution: resolutions[item.id] ?? "keep",
    }))
    onProceed(resolved)
  }

  return (
    <dialog
      open
      className="fixed inset-0 z-50 flex h-full w-full items-center justify-center bg-black/40 p-4"
      aria-labelledby="sensitive-review-title"
    >
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-gray-100 px-6 py-5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-yellow-100">
            <svg
              className="h-5 w-5 text-yellow-600"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-label="警告"
              role="img"
            >
              <title>警告</title>
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <h2 id="sensitive-review-title" className="text-base font-semibold text-gray-900">
              機微情報が見つかりました
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              以下の項目について、公開前に対応を選択してください。
            </p>
          </div>
        </div>

        {/* Items */}
        <div className="max-h-96 overflow-y-auto px-6 py-4">
          <div className="space-y-5">
            {items.map((item, idx) => (
              <div key={item.id} className="rounded-lg border border-gray-100 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-400">{idx + 1}.</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[item.type] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {TYPE_LABELS[item.type] ?? item.type}
                  </span>
                </div>

                <div className="mb-1 font-mono text-sm text-gray-800 bg-gray-50 rounded px-2 py-1">
                  {item.excerpt}
                </div>
                <div className="mb-3 text-xs text-gray-400">場所: {item.location}</div>

                <div className="flex flex-wrap gap-3">
                  {(["keep", "delete", "replace"] as SensitiveResolution[]).map((res) => (
                    <label key={res} className="flex cursor-pointer items-center gap-1.5">
                      <input
                        type="radio"
                        name={`resolution-${item.id}`}
                        value={res}
                        checked={resolutions[item.id] === res}
                        onChange={() => setResolution(item.id, res)}
                        className="h-3.5 w-3.5 text-blue-500"
                      />
                      <span className="text-sm text-gray-700">
                        {res === "keep" && "そのまま含める"}
                        {res === "delete" && "削除する"}
                        {res === "replace" && "[要確認] に置換する"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={handleProceed}
            disabled={!allResolved}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            下書きを確認する →
          </button>
        </div>
      </div>
    </dialog>
  )
}
