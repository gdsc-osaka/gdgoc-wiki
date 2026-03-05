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
    description:
      "Collect the last N minutes of messages and send to the GDGoC Wiki ingestion pipeline",
    options: [
      {
        name: "minutes",
        description: "How many minutes back to collect (1–1440)",
        type: 4, // INTEGER
        required: true,
        min_value: 1,
        max_value: 1440,
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
