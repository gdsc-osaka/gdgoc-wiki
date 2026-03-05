import { AlertCircle, Bell, BellDot, CheckCircle2, HelpCircle, Loader2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"

interface Session {
  id: string
  status: string
  phaseMessage: string | null
  createdAt: string
  updatedAt: string
}

function statusIcon(status: string) {
  switch (status) {
    case "processing":
      return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
    case "done":
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
    case "error":
      return <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
    case "awaiting_clarification":
      return <HelpCircle className="h-4 w-4 shrink-0 text-amber-500" />
    default:
      return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
  }
}

function statusLabel(t: (key: string) => string, status: string): string {
  switch (status) {
    case "processing":
      return t("notifications.status_processing")
    case "done":
      return t("notifications.status_done")
    case "error":
      return t("notifications.status_error")
    case "awaiting_clarification":
      return t("notifications.status_clarification")
    default:
      return t("notifications.status_processing")
  }
}

function relativeTime(t: (key: string, opts?: Record<string, unknown>) => string, iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return t("time.just_now")
  if (mins < 60) return t("time.minutes_ago", { count: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t("time.hours_ago", { count: hours })
  const days = Math.floor(hours / 24)
  return t("time.days_ago", { count: days })
}

export default function NotificationBell({ initialCount }: { initialCount: number }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [count, setCount] = useState(initialCount)
  const ref = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications")
      if (!res.ok) return
      const data = (await res.json()) as { sessions: Session[] }
      setSessions(data.sessions)
      setCount(data.sessions.length)
    } catch {
      // ignore fetch errors
    }
  }, [])

  // Click-outside handler
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Polling: 30s background, 5s when open
  useEffect(() => {
    const interval = open ? 5_000 : 30_000
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(fetchSessions, interval)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [open, fetchSessions])

  // Fetch immediately when dropdown opens
  useEffect(() => {
    if (open) fetchSessions()
  }, [open, fetchSessions])

  // Sync initialCount on server re-renders
  useEffect(() => {
    setCount(initialCount)
  }, [initialCount])

  const BellIcon = count > 0 ? BellDot : Bell

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("notifications.title")}
        aria-label={t("notifications.title")}
        className="relative flex items-center justify-center rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      >
        <BellIcon className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="text-sm font-semibold text-gray-900">{t("notifications.title")}</p>
          </div>

          {sessions.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-400">
              {t("notifications.empty")}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    navigate(`/ingest/${s.id}`)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50"
                >
                  {statusIcon(s.status)}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-800">{statusLabel(t, s.status)}</p>
                    <p className="text-xs text-gray-400">{relativeTime(t, s.updatedAt)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
