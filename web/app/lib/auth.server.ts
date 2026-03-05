import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { and, eq, gt, isNull } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import * as schema from "../db/schema"

/**
 * Creates a better-auth instance bound to the request-scoped Cloudflare env.
 * Must be called per-request because D1 bindings are request-scoped in Workers.
 */
export function createAuth(env: Env) {
  const db = drizzle(env.DB)
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
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
          defaultValue: "pending",
          // "admin" | "lead" | "member" | "viewer" | "pending"
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
    databaseHooks: {
      user: {
        create: {
          before: async (userData) => {
            // On first sign-in, check if there's a valid invitation for this email.
            const now = Math.floor(Date.now() / 1000)
            const drizzleDb = drizzle(env.DB, { schema })
            const invitation = await drizzleDb
              .select()
              .from(schema.invitations)
              .where(
                and(
                  eq(schema.invitations.email, userData.email),
                  gt(schema.invitations.expiresAt, now),
                  isNull(schema.invitations.acceptedAt),
                ),
              )
              .get()

            if (invitation) {
              // Accept the invitation and assign role + chapter
              await drizzleDb
                .update(schema.invitations)
                .set({ acceptedAt: now })
                .where(eq(schema.invitations.id, invitation.id))

              return {
                data: {
                  ...userData,
                  role: invitation.role,
                  chapterId: invitation.chapterId ?? undefined,
                },
              }
            }

            // No invitation found — set to pending (no access)
            return { data: { ...userData, role: "pending" } }
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
export type Session = Awaited<ReturnType<Auth["api"]["getSession"]>>
export type AuthUser = NonNullable<Session>["user"]
