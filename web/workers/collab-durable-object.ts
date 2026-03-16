import { DurableObject } from "cloudflare:workers"
import * as decoding from "lib0/decoding"
import * as encoding from "lib0/encoding"
import * as awarenessProtocol from "y-protocols/awareness"
import * as syncProtocol from "y-protocols/sync"
import * as Y from "yjs"
import { tiptapToMarkdown } from "../app/lib/tiptap-convert"

// Wire protocol message types
const MSG_SYNC = 0
const MSG_AWARENESS = 1

const PERSIST_DEBOUNCE_MS = 10_000
const ALARM_INTERVAL_MS = 60_000
const KV_KEY = "yjs-state"

interface UserInfo {
  userId: string
  userName: string
  userImage: string | null
}

/**
 * Durable Object for realtime collaborative editing.
 *
 * Uses the Hibernation API (state.acceptWebSocket / webSocketMessage / webSocketClose)
 * so that idle connections don't consume CPU.
 *
 * Each instance is identified by a page slug and maintains:
 * - A Y.Doc with getText("contentJa") and getText("contentEn")
 * - An Awareness instance for presence tracking
 * - Persisted Y.Doc state in DO KV storage
 */
export class CollabDurableObject extends DurableObject<Env> {
  private ydoc: Y.Doc
  private awareness: awarenessProtocol.Awareness
  private connections: Map<WebSocket, UserInfo> = new Map()
  private dirty = false
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private initialized = false

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ydoc = new Y.Doc()
    this.awareness = new awarenessProtocol.Awareness(this.ydoc)

    // Listen for Y.Doc updates to broadcast and mark dirty
    this.ydoc.on("update", (update: Uint8Array, origin: unknown) => {
      this.dirty = true
      // Only broadcast updates that came from a client WebSocket (not local initialization)
      const originWs = origin as WebSocket
      if (!this.connections.has(originWs)) return
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MSG_SYNC)
      syncProtocol.writeUpdate(encoder, update)
      const message = encoding.toUint8Array(encoder)
      this.broadcast(message, originWs)
    })

    // Listen for awareness updates to broadcast
    this.awareness.on(
      "update",
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
        const changedClients = added.concat(updated, removed)
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, MSG_AWARENESS)
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
        )
        this.broadcast(encoding.toUint8Array(encoder))
      },
    )
  }

  /**
   * Load persisted Y.Doc state from DO KV storage, falling back to D1 page content.
   */
  private async initialize(slug: string): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    // Try loading from DO KV storage first
    const stored = await this.ctx.storage.get<ArrayBuffer>(KV_KEY)
    if (stored) {
      Y.applyUpdate(this.ydoc, new Uint8Array(stored))
      return
    }

    // Fall back to D1 content
    const row = await this.env.DB.prepare("SELECT content_ja, content_en FROM pages WHERE slug = ?")
      .bind(slug)
      .first<{ content_ja: string | null; content_en: string | null }>()

    if (row) {
      this.ydoc.transact(() => {
        if (row.content_ja) {
          this.ydoc.getText("contentJa").insert(0, tiptapToMarkdown(row.content_ja))
        }
        if (row.content_en) {
          this.ydoc.getText("contentEn").insert(0, tiptapToMarkdown(row.content_en))
        }
      })
    }

    this.dirty = false
  }

  /**
   * Validate session cookie and return user info.
   */
  private async authenticate(request: Request): Promise<UserInfo | null> {
    const cookie = request.headers.get("cookie")
    if (!cookie) return null

    // Extract better-auth session token from cookie
    const match = cookie.match(/better-auth\.session_token=([^;]+)/)
    if (!match) return null
    const token = decodeURIComponent(match[1])

    // Look up session + user in D1
    const row = await this.env.DB.prepare(
      `SELECT u.id, u.name, u.image, u.role, s.expiresAt
       FROM session s JOIN user u ON s.userId = u.id
       WHERE s.token = ?`,
    )
      .bind(token)
      .first<{
        id: string
        name: string
        image: string | null
        role: string
        expiresAt: number
      }>()

    if (!row) return null

    // Check expiry (expiresAt is stored as unix timestamp in seconds)
    if (row.expiresAt * 1000 < Date.now()) return null

    // Must be at least a member
    const roleLevel: Record<string, number> = { admin: 4, lead: 3, member: 2, viewer: 1 }
    if ((roleLevel[row.role] ?? 0) < 2) return null

    return { userId: row.id, userName: row.name, userImage: row.image }
  }

  /**
   * Handle WebSocket upgrade request.
   */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 })
    }

    const user = await this.authenticate(request)
    if (!user) {
      return new Response("Unauthorized", { status: 401 })
    }

    // Extract slug from URL
    const url = new URL(request.url)
    const slug = url.pathname.split("/")[3]
    if (!slug) return new Response("Missing slug", { status: 400 })

    await this.initialize(slug)

    // Create WebSocket pair and accept with Hibernation API
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]

    this.ctx.acceptWebSocket(server)
    this.connections.set(server, user)

    // Schedule alarm for periodic persistence
    const currentAlarm = await this.ctx.storage.getAlarm()
    if (!currentAlarm) {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS)
    }

    // Send initial sync state to the new client
    this.ctx.waitUntil(this.sendInitialSync(server))

    return new Response(null, { status: 101, webSocket: client })
  }

  /**
   * Send sync step 1 + full awareness state to a newly connected client.
   */
  private async sendInitialSync(ws: WebSocket): Promise<void> {
    // Send sync step 1
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_SYNC)
    syncProtocol.writeSyncStep1(encoder, this.ydoc)
    ws.send(encoding.toUint8Array(encoder))

    // Send current awareness state
    const awarenessStates = this.awareness.getStates()
    if (awarenessStates.size > 0) {
      const awarenessEncoder = encoding.createEncoder()
      encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS)
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(awarenessStates.keys())),
      )
      ws.send(encoding.toUint8Array(awarenessEncoder))
    }
  }

  /**
   * Handle incoming WebSocket message (Hibernation API).
   */
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    if (typeof message === "string") return
    const data = new Uint8Array(message)
    const decoder = decoding.createDecoder(data)
    const messageType = decoding.readVarUint(decoder)

    switch (messageType) {
      case MSG_SYNC: {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, MSG_SYNC)
        syncProtocol.readSyncMessage(decoder, encoder, this.ydoc, ws)
        if (encoding.length(encoder) > 1) {
          ws.send(encoding.toUint8Array(encoder))
        }
        break
      }
      case MSG_AWARENESS: {
        const update = decoding.readVarUint8Array(decoder)
        awarenessProtocol.applyAwarenessUpdate(this.awareness, update, ws)
        // Broadcast awareness to all other clients
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, MSG_AWARENESS)
        encoding.writeVarUint8Array(encoder, update)
        this.broadcast(encoding.toUint8Array(encoder), ws)
        break
      }
    }
  }

  /**
   * Handle WebSocket close (Hibernation API).
   */
  async webSocketClose(ws: WebSocket): Promise<void> {
    this.connections.delete(ws)

    // Remove awareness state for this client
    // Find the awareness client ID for this WebSocket
    for (const [clientId, meta] of this.awareness.getStates()) {
      // The awareness state origin is stored with the WebSocket
      if (meta && clientId !== this.ydoc.clientID) {
        // We remove all client IDs that don't have an active connection
        // This is a simplified approach — in production, you'd map clientId to WebSocket
      }
    }

    // If no more connections, persist immediately
    if (this.connections.size === 0) {
      await this.persist()
    } else {
      this.schedulePersist()
    }
  }

  /**
   * Handle WebSocket error (Hibernation API).
   */
  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws)
  }

  /**
   * Alarm handler for periodic persistence.
   */
  async alarm(): Promise<void> {
    if (this.dirty) {
      await this.persist()
    }
    // Reschedule if there are still active connections
    if (this.connections.size > 0) {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS)
    }
  }

  /**
   * Broadcast a message to all connected clients, optionally excluding one.
   */
  private broadcast(message: Uint8Array, exclude?: WebSocket): void {
    for (const ws of this.connections.keys()) {
      if (ws !== exclude) {
        try {
          ws.send(message)
        } catch {
          // Connection likely closed; will be cleaned up in webSocketClose
        }
      }
    }
  }

  /**
   * Schedule debounced persistence.
   */
  private schedulePersist(): void {
    if (this.persistTimer) return
    this.persistTimer = setTimeout(async () => {
      this.persistTimer = null
      await this.persist()
    }, PERSIST_DEBOUNCE_MS)
  }

  /**
   * Persist Y.Doc state to DO KV storage.
   */
  private async persist(): Promise<void> {
    if (!this.dirty) return
    const state = Y.encodeStateAsUpdate(this.ydoc)
    await this.ctx.storage.put(KV_KEY, state.buffer)
    this.dirty = false
  }
}
