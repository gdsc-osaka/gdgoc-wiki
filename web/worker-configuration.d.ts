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
    ASSETS: Fetcher
    MAILER: SendEmail

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
}
