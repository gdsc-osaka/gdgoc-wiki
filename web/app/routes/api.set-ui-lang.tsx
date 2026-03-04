import { eq } from "drizzle-orm"
import type { ActionFunctionArgs } from "react-router"
import * as schema from "~/db/schema"
import { getSessionUser } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.cloudflare
  const formData = await request.formData()
  const lang = formData.get("lang")

  if (lang !== "ja" && lang !== "en") {
    return Response.json({ ok: false, error: "invalid lang" }, { status: 400 })
  }

  const user = await getSessionUser(request, env)
  if (user) {
    const db = getDb(env)
    await db
      .update(schema.user)
      .set({ preferredUiLanguage: lang })
      .where(eq(schema.user.id, user.id))
  }

  return Response.json({ ok: true })
}
