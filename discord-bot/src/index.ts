import { DiscordHono } from "discord-hono"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Env {
  DISCORD_PUBLIC_KEY: string
  DISCORD_BOT_TOKEN: string
  DISCORD_APP_ID: string
  WIKI_BASE_URL: string
  WIKI_API_SECRET: string
}

interface DiscordMessage {
  id: string
  content: string
  timestamp: string
  author: { id: string; username: string; global_name?: string }
  referenced_message?: { author: { username: string; global_name?: string } }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DISCORD_EPOCH = 1420070400000n

function dateToSnowflake(date: Date): string {
  const ts = BigInt(date.getTime()) - DISCORD_EPOCH
  return (ts << 22n).toString()
}

/**
 * Parse a datetime string, treating bare "YYYY-MM-DD HH:MM" as JST (UTC+9).
 */
function parseDateTime(str: string): Date | null {
  const trimmed = str.trim()
  // If no timezone designator, append JST offset
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(trimmed)
  const iso = hasZone ? trimmed : trimmed.replace(" ", "T") + "+09:00"
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

async function fetchMessages(
  channelId: string,
  afterSnowflake: string,
  untilDate: Date,
  botToken: string,
): Promise<DiscordMessage[]> {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100&after=${afterSnowflake}`
  const res = await fetch(url, {
    headers: { Authorization: `Bot ${botToken}` },
  })
  if (!res.ok) {
    throw new Error(`Discord API error: ${res.status}`)
  }
  const messages = (await res.json()) as DiscordMessage[]
  // Messages come newest-first; reverse to chronological, then filter by until
  return messages
    .reverse()
    .filter((m) => new Date(m.timestamp) <= untilDate)
}

function formatMessages(messages: DiscordMessage[], since: Date, until: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false }).replace(/\//g, "-")
  const lines: string[] = [`[Discord] ${fmt(since)} 〜 ${fmt(until)} (JST)\n`]
  for (const msg of messages) {
    const content = msg.content.trim()
    if (!content) continue // skip stickers, embeds-only messages

    // Strip raw @mention snowflakes to keep text readable
    const cleaned = content.replace(/<@!?(\d+)>/g, "@user")

    const displayName = msg.author.global_name ?? msg.author.username
    if (msg.referenced_message) {
      const replyTo =
        msg.referenced_message.author.global_name ?? msg.referenced_message.author.username
      lines.push(`${displayName} (replying to ${replyTo}): ${cleaned}`)
    } else {
      lines.push(`${displayName}: ${cleaned}`)
    }
  }
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new DiscordHono<{ Bindings: Env }>()

app.command("wiki-ingest", (c) => {
  const discordUserId =
    (c.interaction.member as { user?: { id?: string } } | undefined)?.user?.id ??
    (c.interaction.user as { id?: string } | undefined)?.id

  if (!discordUserId) {
    return c.res("Could not determine your Discord user ID.")
  }

  const sinceStr = String(c.var.since ?? "")
  const untilStr = String(c.var.until ?? "")

  const since = parseDateTime(sinceStr)
  if (!since) {
    return c.res(
      `Invalid \`since\` value: "${sinceStr}". Use format: \`YYYY-MM-DD HH:MM\` (JST) or ISO 8601.`,
    )
  }

  const until = untilStr ? parseDateTime(untilStr) : new Date()
  if (!until) {
    return c.res(
      `Invalid \`until\` value: "${untilStr}". Use format: \`YYYY-MM-DD HH:MM\` (JST) or ISO 8601.`,
    )
  }

  if (since >= until) {
    return c.res("`since` must be earlier than `until`.")
  }

  return c.resDefer(async (c) => {
    const channelId = (c.interaction as { channel_id?: string }).channel_id
    if (!channelId) {
      return c.followup("Could not determine the channel.", { ephemeral: true })
    }

    let messages: DiscordMessage[]
    try {
      messages = await fetchMessages(
        channelId,
        dateToSnowflake(since),
        until,
        c.env.DISCORD_BOT_TOKEN,
      )
    } catch (err) {
      console.error("Failed to fetch Discord messages", err)
      return c.followup(
        "Failed to fetch messages. Make sure the bot has Read Message History permission.",
        { ephemeral: true },
      )
    }

    const nonEmpty = messages.filter((m) => m.content.trim())
    if (nonEmpty.length === 0) {
      return c.followup("No messages found in the specified time range.", { ephemeral: true })
    }

    const text = formatMessages(nonEmpty, since, until)

    const wikiRes = await fetch(`${c.env.WIKI_BASE_URL}/api/discord/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.env.WIKI_API_SECRET}`,
      },
      body: JSON.stringify({ discordUserId, text }),
    })

    if (!wikiRes.ok) {
      console.error("Wiki ingest API error", wikiRes.status)
      return c.followup("Wiki ingestion request failed. Please try again later.", {
        ephemeral: true,
      })
    }

    const data = (await wikiRes.json()) as { sessionId?: string; error?: string }

    if (data.error === "no_linked_account") {
      return c.followup(
        `Please link your Discord account at ${c.env.WIKI_BASE_URL}/settings first.`,
        { ephemeral: true },
      )
    }

    if (!data.sessionId) {
      return c.followup("Unexpected error from wiki API.", { ephemeral: true })
    }

    return c.followup(
      `Ingestion started (${nonEmpty.length} messages)! Review and commit at:\n${c.env.WIKI_BASE_URL}/ingest/${data.sessionId}`,
      { ephemeral: true },
    )
  })
})

export default app
