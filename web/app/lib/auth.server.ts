import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { drizzle } from "drizzle-orm/d1"

/**
 * Creates a better-auth instance bound to the request-scoped Cloudflare env.
 * Must be called per-request because D1 bindings are request-scoped in Workers.
 */
export function createAuth(env: Env) {
  const db = drizzle(env.DB)
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite" }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "member",
          // "admin" | "lead" | "member" | "viewer"
        },
        chapterId: {
          type: "string",
          required: false,
        },
        preferredUiLanguage: {
          type: "string",
          defaultValue: "ja",
          // "ja" | "en"
        },
        preferredContentLanguage: {
          type: "string",
          defaultValue: "ja",
          // "ja" | "en"
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
export type Session = Awaited<ReturnType<Auth["api"]["getSession"]>>
export type AuthUser = NonNullable<Session>["user"]
