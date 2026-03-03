import { redirect } from "react-router"
import type { LoaderFunctionArgs } from "react-router"
import { requireRole } from "~/lib/auth-utils.server"
import { getGoogleDriveAuthUrl } from "~/lib/google-drive.server"

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.cloudflare
  await requireRole(request, env, "member")

  // Generate state for CSRF protection
  const stateBytes = new Uint8Array(16)
  crypto.getRandomValues(stateBytes)
  const state = Array.from(stateBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  const url = new URL(request.url)
  const redirectUri = `${url.origin}/api/google-drive/callback`

  const authUrl = getGoogleDriveAuthUrl(env.GOOGLE_DOCS_CLIENT_ID, redirectUri, state)

  // Store state in cookie for verification in callback
  throw redirect(authUrl, {
    headers: {
      "Set-Cookie": `gdrive_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    },
  })
}
