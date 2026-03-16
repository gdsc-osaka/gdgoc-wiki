import { diffChars } from "diff"
import * as decoding from "lib0/decoding"
import * as encoding from "lib0/encoding"
import { useCallback, useEffect, useRef, useState } from "react"
import * as awarenessProtocol from "y-protocols/awareness"
import * as syncProtocol from "y-protocols/sync"
import * as Y from "yjs"

const MSG_SYNC = 0
const MSG_AWARENESS = 1

export interface CollabUser {
  id: string
  name: string
  image: string | null
}

export interface CollabPeer {
  clientId: number
  user: CollabUser
  activeLang: "ja" | "en"
}

interface UseCollabEditorOptions {
  slug: string
  initialContentJa: string
  initialContentEn: string
  user: CollabUser
}

interface UseCollabEditorReturn {
  contentJa: string
  contentEn: string
  setContentJa: (value: string) => void
  setContentEn: (value: string) => void
  peers: CollabPeer[]
  connected: boolean
  setActiveLang: (lang: "ja" | "en") => void
}

/**
 * Apply a new string value to a Y.Text by computing a character-level diff
 * and applying insert/delete operations.
 */
function applyStringToYText(ytext: Y.Text, newValue: string): void {
  const currentValue = ytext.toString()
  if (currentValue === newValue) return

  const changes = diffChars(currentValue, newValue)
  ytext.doc?.transact(() => {
    let pos = 0
    for (const change of changes) {
      if (change.removed) {
        ytext.delete(pos, change.value.length)
      } else if (change.added) {
        ytext.insert(pos, change.value)
        pos += change.value.length
      } else {
        pos += change.value.length
      }
    }
  })
}

export function useCollabEditor({
  slug,
  initialContentJa,
  initialContentEn,
  user,
}: UseCollabEditorOptions): UseCollabEditorReturn {
  const [contentJa, setContentJaState] = useState(initialContentJa)
  const [contentEn, setContentEnState] = useState(initialContentEn)
  const [peers, setPeers] = useState<CollabPeer[]>([])
  const [connected, setConnected] = useState(false)

  const ydocRef = useRef<Y.Doc | null>(null)
  const awarenessRef = useRef<awarenessProtocol.Awareness | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const isRemoteUpdate = useRef(false)
  const reconnectAttempt = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeLangRef = useRef<"ja" | "en">("ja")
  const mountedRef = useRef(true)

  // Update awareness when active language changes
  const setActiveLang = useCallback((lang: "ja" | "en") => {
    activeLangRef.current = lang
    if (awarenessRef.current) {
      awarenessRef.current.setLocalStateField("activeLang", lang)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const ydoc = new Y.Doc()
    const awareness = new awarenessProtocol.Awareness(ydoc)
    ydocRef.current = ydoc
    awarenessRef.current = awareness

    const textJa = ydoc.getText("contentJa")
    const textEn = ydoc.getText("contentEn")

    // Observe Y.Text changes and update React state
    const observerJa = () => {
      if (!mountedRef.current) return
      isRemoteUpdate.current = true
      setContentJaState(textJa.toString())
      // Use microtask to reset flag after React processes the update
      queueMicrotask(() => {
        isRemoteUpdate.current = false
      })
    }
    const observerEn = () => {
      if (!mountedRef.current) return
      isRemoteUpdate.current = true
      setContentEnState(textEn.toString())
      queueMicrotask(() => {
        isRemoteUpdate.current = false
      })
    }
    textJa.observe(observerJa)
    textEn.observe(observerEn)

    // Observe awareness changes
    const awarenessHandler = () => {
      if (!mountedRef.current) return
      const states = awareness.getStates()
      const newPeers: CollabPeer[] = []
      for (const [clientId, state] of states) {
        if (clientId === ydoc.clientID) continue
        if (state.user) {
          newPeers.push({
            clientId,
            user: state.user as CollabUser,
            activeLang: (state.activeLang as "ja" | "en") ?? "ja",
          })
        }
      }
      setPeers(newPeers)
    }
    awareness.on("change", awarenessHandler)

    // Send outgoing Y.Doc updates to server (registered once, not per-connect)
    const sendUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MSG_SYNC)
      syncProtocol.writeUpdate(encoder, update)
      ws.send(encoding.toUint8Array(encoder))
    }
    ydoc.on("update", sendUpdate)

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/collab/${slug}`)
      ws.binaryType = "arraybuffer"
      wsRef.current = ws

      ws.addEventListener("open", () => {
        if (!mountedRef.current) return
        setConnected(true)
        reconnectAttempt.current = 0

        // Server sends sync step 1 on connect; client responds via message handler.
        // Set awareness local state
        awareness.setLocalState({
          user: { id: user.id, name: user.name, image: user.image },
          activeLang: activeLangRef.current,
        })
      })

      ws.addEventListener("message", (event) => {
        if (typeof event.data === "string") return
        const data = new Uint8Array(event.data as ArrayBuffer)
        const decoder = decoding.createDecoder(data)
        const messageType = decoding.readVarUint(decoder)

        switch (messageType) {
          case MSG_SYNC: {
            const encoder = encoding.createEncoder()
            encoding.writeVarUint(encoder, MSG_SYNC)
            syncProtocol.readSyncMessage(decoder, encoder, ydoc, "remote")
            if (encoding.length(encoder) > 1) {
              ws.send(encoding.toUint8Array(encoder))
            }
            break
          }
          case MSG_AWARENESS: {
            const update = decoding.readVarUint8Array(decoder)
            awarenessProtocol.applyAwarenessUpdate(awareness, update, "remote")
            break
          }
        }
      })

      ws.addEventListener("close", () => {
        if (!mountedRef.current) return
        setConnected(false)
        wsRef.current = null

        // Reconnect with exponential backoff
        const delay = Math.min(1000 * 2 ** reconnectAttempt.current, 30_000)
        reconnectAttempt.current++
        reconnectTimer.current = setTimeout(connect, delay)
      })

      ws.addEventListener("error", () => {
        ws.close()
      })
    }

    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      textJa.unobserve(observerJa)
      textEn.unobserve(observerEn)
      awareness.off("change", awarenessHandler)
      ydoc.off("update", sendUpdate)
      awareness.destroy()
      ydoc.destroy()
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      ydocRef.current = null
      awarenessRef.current = null
    }
  }, [slug, user.id, user.name, user.image])

  // Editor → CRDT: apply string diff when content changes from local edits
  const setContentJa = useCallback((value: string) => {
    if (isRemoteUpdate.current) return
    const ydoc = ydocRef.current
    if (!ydoc) {
      setContentJaState(value)
      return
    }
    applyStringToYText(ydoc.getText("contentJa"), value)
  }, [])

  const setContentEn = useCallback((value: string) => {
    if (isRemoteUpdate.current) return
    const ydoc = ydocRef.current
    if (!ydoc) {
      setContentEnState(value)
      return
    }
    applyStringToYText(ydoc.getText("contentEn"), value)
  }, [])

  return { contentJa, contentEn, setContentJa, setContentEn, peers, connected, setActiveLang }
}
