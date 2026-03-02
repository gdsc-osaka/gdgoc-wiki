// Cloudflare Worker bindings and environment variables.
// Kept in sync with wrangler.toml bindings and secrets.
interface Env {
  // Cloudflare bindings (defined in wrangler.toml)
  DB: D1Database
  BUCKET: R2Bucket
  TRANSLATION_QUEUE: Queue
  ASSETS: Fetcher

  // Secrets (set via `wrangler secret put` or Cloudflare dashboard)
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GEMINI_API_KEY: string
  GOOGLE_DOCS_CLIENT_ID: string
  GOOGLE_DOCS_CLIENT_SECRET: string

  // Vars (defined in wrangler.toml [vars])
  ENVIRONMENT: string
}
