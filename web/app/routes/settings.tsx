import { eq } from "drizzle-orm"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useFetcher, useLoaderData } from "react-router"
import * as schema from "~/db/schema"
import { supportedLngs } from "~/i18n"
import { requireRole } from "~/lib/auth-utils.server"
import { getDb } from "~/lib/db.server"
import type { Route } from ".react-router/types/app/routes/+types/settings"

export async function loader({ request, context }: Route.LoaderArgs) {
  const { cloudflare } = context
  const user = await requireRole(request, cloudflare.env, "viewer")
  const db = getDb(cloudflare.env)
  const chapters = await db.select().from(schema.chapters).orderBy(schema.chapters.nameJa).all()
  return { user, chapters }
}

type ActionResult = { intent: string | null; ok: boolean; error?: string; uiLang?: string }

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const { cloudflare } = context
  const user = await requireRole(request, cloudflare.env, "viewer")
  const db = getDb(cloudflare.env)
  const form = await request.formData()
  const intent = form.get("intent") as string

  if (intent === "updateName") {
    const name = (form.get("name") as string | null)?.trim() ?? ""
    if (!name || name.length > 100) {
      return { intent, ok: false, error: "invalid_name" }
    }
    await db
      .update(schema.user)
      .set({ name, updatedAt: new Date() })
      .where(eq(schema.user.id, user.id))
    return { intent, ok: true }
  }

  if (intent === "updateLanguage") {
    const uiLang = form.get("uiLang") as string | null
    const contentLang = form.get("contentLang") as string | null
    if (
      !uiLang ||
      !contentLang ||
      !supportedLngs.includes(uiLang as never) ||
      !supportedLngs.includes(contentLang as never)
    ) {
      return { intent, ok: false, error: "invalid_lang" }
    }
    await db
      .update(schema.user)
      .set({
        preferredUiLanguage: uiLang,
        preferredContentLanguage: contentLang,
        updatedAt: new Date(),
      })
      .where(eq(schema.user.id, user.id))
    return { intent, ok: true, uiLang }
  }

  if (intent === "updateDiscord") {
    const discordId = (form.get("discordId") as string | null)?.trim() ?? ""
    if (discordId && !/^\d{17,20}$/.test(discordId)) {
      return { intent, ok: false, error: "invalid_discord_id" }
    }
    await db
      .update(schema.user)
      .set({ discordId: discordId || null, updatedAt: new Date() })
      .where(eq(schema.user.id, user.id))
    return { intent, ok: true }
  }

  if (intent === "updateChapter") {
    const chapterId = (form.get("chapterId") as string | null) ?? ""
    if (chapterId) {
      const [chapter] = await db
        .select({ id: schema.chapters.id })
        .from(schema.chapters)
        .where(eq(schema.chapters.id, chapterId))
        .all()
      if (!chapter) {
        return { intent, ok: false, error: "invalid_chapter" }
      }
    }
    await db
      .update(schema.user)
      .set({ chapterId: chapterId || null, updatedAt: new Date() })
      .where(eq(schema.user.id, user.id))
    return { intent, ok: true }
  }

  return { intent: null, ok: false }
}

// ---------------------------------------------------------------------------
// SaveButton: Save → Saving... → ✓ Saved (auto-clears after 3s)
// ---------------------------------------------------------------------------
function SaveButton({
  state,
  saved,
}: {
  state: "idle" | "submitting" | "loading"
  saved: boolean
}) {
  const { t } = useTranslation()
  const submitting = state !== "idle"

  let label = t("settings.save")
  if (submitting) label = t("settings.saving")
  else if (saved) label = t("settings.saved")

  return (
    <button
      type="submit"
      disabled={submitting}
      className="rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// SectionCard
// ---------------------------------------------------------------------------
function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Settings page component
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  const { user, chapters } = useLoaderData<typeof loader>()
  const { t, i18n } = useTranslation()

  // ── Display Name ──────────────────────────────────────────────────────────
  const nameFetcher = useFetcher<typeof action>()
  const [nameSaved, setNameSaved] = useState(false)

  useEffect(() => {
    if (nameFetcher.state === "idle" && nameFetcher.data?.ok === true) {
      setNameSaved(true)
      const timer = setTimeout(() => setNameSaved(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [nameFetcher.state, nameFetcher.data])

  // ── Language Preferences ─────────────────────────────────────────────────
  const langFetcher = useFetcher<typeof action>()
  const [langSaved, setLangSaved] = useState(false)

  useEffect(() => {
    if (langFetcher.state === "idle" && langFetcher.data?.ok === true) {
      if (langFetcher.data.uiLang) {
        i18n.changeLanguage(langFetcher.data.uiLang)
        localStorage.setItem("ui_lang", langFetcher.data.uiLang)
      }
      setLangSaved(true)
      const timer = setTimeout(() => setLangSaved(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [langFetcher.state, langFetcher.data, i18n])

  // ── Discord ───────────────────────────────────────────────────────────────
  const discordFetcher = useFetcher<typeof action>()
  const [discordSaved, setDiscordSaved] = useState(false)

  useEffect(() => {
    if (discordFetcher.state === "idle" && discordFetcher.data?.ok === true) {
      setDiscordSaved(true)
      const timer = setTimeout(() => setDiscordSaved(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [discordFetcher.state, discordFetcher.data])

  // ── Chapter Affiliation ───────────────────────────────────────────────────
  const chapterFetcher = useFetcher<typeof action>()
  const [chapterSaved, setChapterSaved] = useState(false)

  useEffect(() => {
    if (chapterFetcher.state === "idle" && chapterFetcher.data?.ok === true) {
      setChapterSaved(true)
      const timer = setTimeout(() => setChapterSaved(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [chapterFetcher.state, chapterFetcher.data])

  const isJa = i18n.language !== "en"

  return (
    <div className="max-w-2xl px-8 py-8">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">{t("settings.title")}</h1>
      <p className="mb-8 text-sm text-gray-500">{t("settings.subtitle")}</p>

      <div className="flex flex-col gap-6">
        {/* Display Name */}
        <SectionCard title={t("settings.name.title")} description={t("settings.name.description")}>
          <nameFetcher.Form method="post">
            <input type="hidden" name="intent" value="updateName" />
            <div className="mb-4">
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
                {t("settings.name.label")}
              </label>
              <input
                id="name"
                name="name"
                type="text"
                defaultValue={user.name}
                maxLength={100}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {nameFetcher.data?.ok === false && nameFetcher.data.error && (
                <p className="mt-1 text-xs text-red-500">
                  {t(`settings.errors.${nameFetcher.data.error}`, t("settings.save_error"))}
                </p>
              )}
            </div>
            <SaveButton state={nameFetcher.state} saved={nameSaved} />
          </nameFetcher.Form>
        </SectionCard>

        {/* Language Preferences */}
        <SectionCard
          title={t("settings.language.title")}
          description={t("settings.language.description")}
        >
          <langFetcher.Form method="post">
            <input type="hidden" name="intent" value="updateLanguage" />
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="uiLang" className="mb-1 block text-sm font-medium text-gray-700">
                  {t("settings.language.ui_label")}
                </label>
                <select
                  id="uiLang"
                  name="uiLang"
                  defaultValue={user.preferredUiLanguage ?? "ja"}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {supportedLngs.map((lng) => (
                    <option key={lng} value={lng}>
                      {t(`language.${lng}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="contentLang"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  {t("settings.language.content_label")}
                </label>
                <select
                  id="contentLang"
                  name="contentLang"
                  defaultValue={user.preferredContentLanguage ?? "ja"}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {supportedLngs.map((lng) => (
                    <option key={lng} value={lng}>
                      {t(`language.${lng}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {langFetcher.data?.ok === false && langFetcher.data.error && (
              <p className="mb-3 text-xs text-red-500">
                {t(`settings.errors.${langFetcher.data.error}`, t("settings.save_error"))}
              </p>
            )}
            <SaveButton state={langFetcher.state} saved={langSaved} />
          </langFetcher.Form>
        </SectionCard>

        {/* Discord */}
        <SectionCard
          title={t("settings.discord.title")}
          description={t("settings.discord.description")}
        >
          <discordFetcher.Form method="post">
            <input type="hidden" name="intent" value="updateDiscord" />
            <div className="mb-4">
              <label htmlFor="discordId" className="mb-1 block text-sm font-medium text-gray-700">
                {t("settings.discord.idLabel")}
              </label>
              <input
                id="discordId"
                name="discordId"
                type="text"
                defaultValue={user.discordId ?? ""}
                placeholder="e.g. 123456789012345678"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">{t("settings.discord.idHint")}</p>
              {discordFetcher.data?.ok === false && discordFetcher.data.error && (
                <p className="mt-1 text-xs text-red-500">
                  {t(`settings.errors.${discordFetcher.data.error}`, t("settings.save_error"))}
                </p>
              )}
            </div>
            <SaveButton state={discordFetcher.state} saved={discordSaved} />
          </discordFetcher.Form>
        </SectionCard>

        {/* Chapter Affiliation */}
        <SectionCard
          title={t("settings.chapter.title")}
          description={t("settings.chapter.description")}
        >
          <chapterFetcher.Form method="post">
            <input type="hidden" name="intent" value="updateChapter" />
            <div className="mb-4">
              <label htmlFor="chapterId" className="mb-1 block text-sm font-medium text-gray-700">
                {t("settings.chapter.label")}
              </label>
              <select
                id="chapterId"
                name="chapterId"
                defaultValue={user.chapterId ?? ""}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">{t("settings.chapter.none")}</option>
                {chapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {isJa ? ch.nameJa : ch.nameEn}
                  </option>
                ))}
              </select>
              {chapterFetcher.data?.ok === false && chapterFetcher.data.error && (
                <p className="mt-1 text-xs text-red-500">
                  {t(`settings.errors.${chapterFetcher.data.error}`, t("settings.save_error"))}
                </p>
              )}
            </div>
            <SaveButton state={chapterFetcher.state} saved={chapterSaved} />
          </chapterFetcher.Form>
        </SectionCard>
      </div>
    </div>
  )
}
