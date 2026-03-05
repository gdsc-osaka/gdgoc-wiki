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
  author: { id: string; username: string; global_name?: string }
  referenced_message?: { author: { username: string; global_name?: string } }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a number of minutes in the past to a Discord snowflake string.
 * Used as the `after` parameter for the Messages API.
 */
function minutesToSnowflake(minutes: number): string {
  const DISCORD_EPOCH = 1420070400000n
  const ts = BigInt(Date.now() - minutes * 60_000) - DISCORD_EPOCH
  return (ts << 22n).toString()
}

async function fetchMessages(
  channelId: string,
  afterSnowflake: string,
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
  // Messages come newest-first; reverse to chronological order
  return messages.reverse()
}

function formatMessages(messages: DiscordMessage[], minutes: number): string {
  const lines: string[] = [`[Discord] Past ${minutes} minutes:\n`]
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
  const minutes = Number(c.var.minutes ?? 30)
  const discordUserId =
    (c.interaction.member as { user?: { id?: string } } | undefined)?.user?.id ??
    (c.interaction.user as { id?: string } | undefined)?.id

  if (!discordUserId) {
    return c.res("Could not determine your Discord user ID.")
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
        minutesToSnowflake(minutes),
        c.env.DISCORD_BOT_TOKEN,
      )
    } catch (err) {
      console.error("Failed to fetch Discord messages", err)
      return c.followup("Failed to fetch messages. Make sure the bot has Read Message History permission.", { ephemeral: true })
    }

    const nonEmpty = messages.filter((m) => m.content.trim())
    if (nonEmpty.length === 0) {
      return c.followup(`No messages found in the past ${minutes} minute(s).`, { ephemeral: true })
    }

    const text = formatMessages(nonEmpty, minutes)

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
      return c.followup("Wiki ingestion request failed. Please try again later.", { ephemeral: true })
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
