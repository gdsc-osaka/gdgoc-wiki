import { Check, Copy, Link, Loader2, Minus, UserPlus, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useFetcher } from "react-router"
import type { PageAccessEntry, PageRole } from "~/lib/page-access.server"

interface ShareDialogProps {
  open: boolean
  onClose: () => void
  pageId: string
  pageTitle: string
  currentVisibility: string
  canManageAccess: boolean
  canChangeVisibility: boolean
}

interface AccessData {
  accessList: PageAccessEntry[]
  myRole: PageRole | null
  canChangeVisibility: boolean
  visibility: string
}

const ROLE_OPTIONS: PageRole[] = ["owner", "editor", "viewer"]

const VISIBILITY_OPTIONS = [
  { value: "restricted", labelKey: "wiki.visibility_restricted" },
  { value: "public", labelKey: "wiki.visibility_public" },
  { value: "private_to_chapter", labelKey: "wiki.visibility_chapter" },
  { value: "private_to_lead", labelKey: "wiki.visibility_lead" },
] as const

export default function ShareDialog({
  open,
  onClose,
  pageId,
  pageTitle,
  currentVisibility,
  canManageAccess,
  canChangeVisibility,
}: ShareDialogProps) {
  const { t } = useTranslation("common")
  const dataFetcher = useFetcher<AccessData>()
  const mutateFetcher = useFetcher()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<PageRole>("viewer")
  const [copied, setCopied] = useState(false)
  const [localVisibility, setLocalVisibility] = useState(currentVisibility)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  // Load access list when dialog opens
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataFetcher.load is stable
  useEffect(() => {
    if (!open) return
    setLocalVisibility(currentVisibility)
    dataFetcher.load(`/api/page-access/${pageId}`)
  }, [open, pageId, currentVisibility])

  // Update local visibility when data loads
  useEffect(() => {
    if (dataFetcher.data) {
      setLocalVisibility(dataFetcher.data.visibility)
    }
  }, [dataFetcher.data])

  // Reload after mutations
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataFetcher.load and t are stable
  useEffect(() => {
    if (mutateFetcher.state === "idle" && mutateFetcher.data) {
      const d = mutateFetcher.data as { ok?: boolean; error?: string }
      if (d.error) {
        setErrorMsg(t(`wiki.share_error_${d.error}`, { defaultValue: d.error }))
      } else {
        setErrorMsg(null)
        setEmail("")
        dataFetcher.load(`/api/page-access/${pageId}`)
      }
    }
  }, [mutateFetcher.state, mutateFetcher.data, pageId])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  const accessList = dataFetcher.data?.accessList ?? []
  const myRole = dataFetcher.data?.myRole ?? null
  const effectiveCanChangeVisibility = dataFetcher.data?.canChangeVisibility ?? canChangeVisibility
  const isLoading = dataFetcher.state !== "idle"

  function handleAdd() {
    if (!email.trim()) return
    setErrorMsg(null)
    mutateFetcher.submit(JSON.stringify({ intent: "add", email: email.trim(), pageRole: role }), {
      method: "post",
      action: `/api/page-access/${pageId}`,
      encType: "application/json",
    })
  }

  function handleUpdateRole(accessId: string, pageRole: PageRole) {
    mutateFetcher.submit(JSON.stringify({ intent: "update", accessId, pageRole }), {
      method: "post",
      action: `/api/page-access/${pageId}`,
      encType: "application/json",
    })
  }

  function handleRemove(accessId: string) {
    setErrorMsg(null)
    mutateFetcher.submit(JSON.stringify({ intent: "remove", accessId }), {
      method: "post",
      action: `/api/page-access/${pageId}`,
      encType: "application/json",
    })
  }

  function handleVisibilityChange(visibility: string) {
    setLocalVisibility(visibility)
    mutateFetcher.submit(JSON.stringify({ intent: "setVisibility", visibility }), {
      method: "post",
      action: `/api/page-access/${pageId}`,
      encType: "application/json",
    })
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function canGrantRole(targetRole: PageRole): boolean {
    if (!canManageAccess) return false
    if (myRole === "owner") return true
    if (myRole === "editor") return targetRole !== "owner"
    return false
  }

  return (
    /* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop handled; Escape via window keydown */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stop propagation */}
      <dialog
        open
        onClick={(e) => e.stopPropagation()}
        className="relative m-4 w-full max-w-lg rounded-xl bg-white p-0 shadow-xl"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 id="share-dialog-title" className="text-base font-semibold text-gray-900">
            {t("wiki.share_dialog_title", { title: pageTitle })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label={t("close")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* Add people */}
          {canManageAccess && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("wiki.share_add_people")}
              </p>
              <div className="flex gap-2">
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd()
                  }}
                  placeholder={t("wiki.share_add_placeholder")}
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as PageRole)}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
                >
                  {ROLE_OPTIONS.filter((r) => canGrantRole(r)).map((r) => (
                    <option key={r} value={r}>
                      {t(`wiki.share_role_${r}`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!email.trim() || mutateFetcher.state !== "idle"}
                  className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <UserPlus size={14} />
                  {t("wiki.share_add_button")}
                </button>
              </div>
              {errorMsg && <p className="mt-1.5 text-xs text-red-600">{errorMsg}</p>}
            </div>
          )}

          {/* People with access */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("wiki.share_people_with_access")}
            </p>
            {isLoading && accessList.length === 0 ? (
              <div className="flex justify-center py-4">
                <Loader2 size={18} className="animate-spin text-gray-400" />
              </div>
            ) : accessList.length === 0 ? (
              <p className="text-sm text-gray-400">{t("wiki.share_no_access")}</p>
            ) : (
              <ul className="space-y-2">
                {accessList.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3">
                    {/* Avatar */}
                    {entry.userImage ? (
                      <img
                        src={entry.userImage}
                        alt={entry.userName ?? entry.email}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                        {(entry.userName ?? entry.email).charAt(0).toUpperCase()}
                      </span>
                    )}
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      {entry.userName ? (
                        <>
                          <p className="truncate text-sm font-medium text-gray-800">
                            {entry.userName}
                          </p>
                          <p className="truncate text-xs text-gray-400">{entry.email}</p>
                        </>
                      ) : (
                        <>
                          <p className="truncate text-sm text-gray-800">{entry.email}</p>
                          <p className="text-xs text-gray-400">{t("wiki.share_pending")}</p>
                        </>
                      )}
                    </div>
                    {/* Role dropdown */}
                    {canManageAccess && canGrantRole(entry.pageRole as PageRole) ? (
                      <select
                        value={entry.pageRole}
                        onChange={(e) => handleUpdateRole(entry.id, e.target.value as PageRole)}
                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                      >
                        {ROLE_OPTIONS.filter((r) => canGrantRole(r)).map((r) => (
                          <option key={r} value={r}>
                            {t(`wiki.share_role_${r}`)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-500">
                        {t(`wiki.share_role_${entry.pageRole}`)}
                      </span>
                    )}
                    {/* Remove */}
                    {canManageAccess && (
                      <button
                        type="button"
                        onClick={() => handleRemove(entry.id)}
                        className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        aria-label={t("wiki.share_remove")}
                      >
                        <Minus size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* General access */}
          {effectiveCanChangeVisibility && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("wiki.share_general_access")}
              </p>
              <select
                value={localVisibility}
                onChange={(e) => handleVisibilityChange(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
              >
                {VISIBILITY_OPTIONS.map(({ value, labelKey }) => (
                  <option key={value} value={value}>
                    {t(labelKey)}
                  </option>
                ))}
              </select>
              {localVisibility === "restricted" && (
                <p className="mt-1 text-xs text-gray-500">
                  {t("wiki.share_general_restricted_desc")}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            {copied ? (
              <>
                <Check size={14} className="text-green-600" />
                {t("wiki.share_copied")}
              </>
            ) : (
              <>
                <Link size={14} />
                {t("wiki.share_copy_link")}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            {t("close")}
          </button>
        </div>
      </dialog>
    </div>
  )
}
