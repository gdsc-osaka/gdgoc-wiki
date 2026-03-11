// Extend React Router's AppLoadContext with Cloudflare-specific bindings.
// This type is used in loaders/actions via `context.cloudflare.env`.
// The `export {}` makes this file a module, so the declaration below is a
// proper augmentation (not an ambient override) of the react-router module.
export {}

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: Env
      ctx: ExecutionContext
    }
  }
}

// Cloudflare Worker bindings and environment variables.
// Kept in sync with wrangler.toml bindings and secrets.
declare global {
  interface Env {
    // Cloudflare bindings (defined in wrangler.toml)
    DB: D1Database
    BUCKET: R2Bucket
    TRANSLATION_QUEUE: Queue
    INGESTION_QUEUE: Queue
    ASSETS: Fetcher
    BROWSER: Fetcher
    AI: Ai
    VECTORIZE: VectorizeIndex

    // Secrets (set via `wrangler secret put` or Cloudflare dashboard)
    RESEND_API_KEY: string
    BETTER_AUTH_SECRET: string
    BETTER_AUTH_URL: string
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
    GEMINI_API_KEY: string
    GOOGLE_DOCS_CLIENT_ID: string
    GOOGLE_DOCS_CLIENT_SECRET: string
    WIKI_DISCORD_SECRET: string
    FCM_SERVICE_ACCOUNT_JSON: string

    // Vars (defined in wrangler.toml [vars])
    ENVIRONMENT: string
    FIREBASE_API_KEY: string
    FIREBASE_AUTH_DOMAIN: string
    FIREBASE_PROJECT_ID: string
    FIREBASE_MESSAGING_SENDER_ID: string
    FIREBASE_APP_ID: string
    FIREBASE_VAPID_KEY: string
  }
}
