import { useState } from "react"
import type { CollabPeer } from "~/hooks/useCollabEditor"

const MAX_VISIBLE = 5

const LANG_COLORS: Record<string, string> = {
  ja: "bg-red-500",
  en: "bg-blue-500",
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

// Simple hash for consistent avatar background colors
function hashColor(str: string): string {
  const colors = [
    "bg-rose-400",
    "bg-amber-400",
    "bg-emerald-400",
    "bg-cyan-400",
    "bg-violet-400",
    "bg-pink-400",
    "bg-teal-400",
    "bg-indigo-400",
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return colors[Math.abs(hash) % colors.length]
}

interface PresenceAvatarsProps {
  peers: CollabPeer[]
}

export default function PresenceAvatars({ peers }: PresenceAvatarsProps) {
  if (peers.length === 0) return null

  const visible = peers.slice(0, MAX_VISIBLE)
  const overflow = peers.length - MAX_VISIBLE

  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((peer) => (
        <Avatar key={peer.clientId} peer={peer} />
      ))}
      {overflow > 0 && (
        <span className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-xs font-medium text-gray-600">
          +{overflow}
        </span>
      )}
    </div>
  )
}

function Avatar({ peer }: { peer: CollabPeer }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const langDot = LANG_COLORS[peer.activeLang] ?? "bg-gray-400"

  return (
    <div
      className="relative z-10"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {peer.user.image ? (
        <img
          src={peer.user.image}
          alt={peer.user.name}
          className="h-7 w-7 rounded-full border-2 border-white object-cover"
        />
      ) : (
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-medium text-white ${hashColor(peer.user.id)}`}
        >
          {getInitials(peer.user.name)}
        </span>
      )}
      {/* Language indicator dot */}
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white ${langDot}`}
      />
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-0.5 text-xs text-white shadow">
          {peer.user.name}
        </div>
      )}
    </div>
  )
}
