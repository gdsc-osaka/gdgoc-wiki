# GDGoC Wiki — Discord Bot

Cloudflare Worker that handles Discord slash commands for the GDGoC Japan Wiki.
Built with [Hono](https://hono.dev/) + [discord-hono](https://discord-hono.luis.fun/).

## Commands

| Command | Description |
|---|---|
| `/wiki-ingest since:<datetime> [until:<datetime>]` | Collects messages from the current channel in the given time range and sends them to the wiki ingestion pipeline for review |

Datetime values are accepted as `YYYY-MM-DD HH:MM` (treated as JST / UTC+9) or any ISO 8601 string.

## Prerequisites

- [pnpm](https://pnpm.io/) >= 10
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (installed as a dev dependency)
- A Discord application — create one at the [Discord Developer Portal](https://discord.com/developers/applications)

## Initial Setup

### 1. Create a Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and click **New Application**.
2. Note the **Application ID** (General Information tab).
3. Go to **Bot** tab:
   - Click **Reset Token** and copy the bot token.
   - Enable **Server Members Intent** if needed.
4. Go to **General Information** tab and copy the **Public Key**.

### 2. Install dependencies

```bash
cd discord-bot
pnpm install
```

### 3. Set Wrangler secrets

```bash
wrangler secret put DISCORD_PUBLIC_KEY   # from General Information tab
wrangler secret put DISCORD_BOT_TOKEN    # from Bot tab
wrangler secret put DISCORD_APP_ID       # Application ID
wrangler secret put WIKI_API_SECRET      # must match WIKI_DISCORD_SECRET in the wiki worker
```

`WIKI_BASE_URL` is a plain var (not a secret) already set in `wrangler.toml`.

### 4. Register slash commands

Run once after initial deploy or whenever commands change:

```bash
DISCORD_APP_ID=<app_id> DISCORD_BOT_TOKEN=<token> pnpm register
```

### 5. Set the Interactions Endpoint URL

1. Deploy the worker first (see [Deployment](#deployment)) to get its URL.
2. In the Discord Developer Portal → **General Information**, set:
   ```
   Interactions Endpoint URL: https://gdgoc-wiki-discord-bot.<your-account>.workers.dev
   ```
3. Discord will verify the endpoint using `DISCORD_PUBLIC_KEY` — the worker must already be live.

### 6. Invite the bot to your server

In the Developer Portal → **OAuth2 → URL Generator**:
- Scopes: `bot`, `applications.commands`
- Bot permissions: **Read Message History**, **Send Messages** (in the channels where `/wiki-ingest` will be used)

Copy the generated URL and open it to invite the bot.

## Development

```bash
pnpm dev        # Start local worker with wrangler dev
pnpm check      # Biome lint + format check
pnpm typecheck  # tsc --noEmit
```

> Note: `wrangler dev` cannot fully simulate Discord's interaction signature verification locally. Use [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) or similar to expose a tunnel if you need to test end-to-end.

## Deployment

```bash
pnpm deploy
```

Or push to `main` — the `cd-discord-bot.yml` GitHub Actions workflow deploys automatically after production environment approval.

Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Secrets Reference

| Secret | Where to find it |
|---|---|
| `DISCORD_PUBLIC_KEY` | Developer Portal → General Information |
| `DISCORD_BOT_TOKEN` | Developer Portal → Bot → Reset Token |
| `DISCORD_APP_ID` | Developer Portal → General Information |
| `WIKI_API_SECRET` | Must match `WIKI_DISCORD_SECRET` wrangler secret on the wiki worker |
