/**
 * One-time slash command registration script.
 *
 * Usage:
 *   DISCORD_APP_ID=<app_id> DISCORD_BOT_TOKEN=<token> npx tsx scripts/register.ts
 *
 * Or set the variables in a .env file and use:
 *   npx dotenv -e .env -- npx tsx scripts/register.ts
 */

const APP_ID = process.env.DISCORD_APP_ID
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN

if (!APP_ID || !BOT_TOKEN) {
  console.error("Error: DISCORD_APP_ID and DISCORD_BOT_TOKEN must be set")
  process.exit(1)
}

const commands = [
  {
    name: "wiki-ingest",
    description: "Collect channel messages in a time range and send to the GDGoC Wiki ingestion pipeline",
    options: [
      {
        name: "since",
        description: "Start datetime, e.g. 2024-06-01 09:00 (JST) or ISO 8601",
        type: 3, // STRING
        required: true,
      },
      {
        name: "until",
        description: "End datetime (default: now), e.g. 2024-06-01 12:00 (JST) or ISO 8601",
        type: 3, // STRING
        required: false,
      },
    ],
  },
]

void (async () => {
  const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${BOT_TOKEN}`,
    },
    body: JSON.stringify(commands),
  })

  if (res.ok) {
    const data = await res.json()
    console.log("Commands registered successfully:")
    console.log(JSON.stringify(data, null, 2))
  } else {
    const error = await res.text()
    console.error(`Failed to register commands (${res.status}):`, error)
    process.exit(1)
  }
})()
