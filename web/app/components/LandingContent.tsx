import { useTranslation } from "react-i18next"
import { Link } from "react-router"

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconBrain() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
      <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
      <path d="M6 18a4 4 0 0 1-1.967-.516" />
      <path d="M19.967 17.484A4 4 0 0 1 18 18" />
    </svg>
  )
}

function IconGlobe() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  )
}

function IconBookOpen() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconUpload() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  )
}

function IconSparkles() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Google icon (for sign-in button)
// ---------------------------------------------------------------------------

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Feature card data
// ---------------------------------------------------------------------------

type Feature = {
  key: string
  titleKey: string
  descKey: string
  iconBg: string
  iconColor: string
  iconShape: "circle" | "rect"
  icon: React.ReactNode
}

const FEATURES: Feature[] = [
  {
    key: "ingest",
    titleKey: "lp.feature_ingest_title",
    descKey: "lp.feature_ingest_desc",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    iconShape: "circle",
    icon: <IconBrain />,
  },
  {
    key: "bilingual",
    titleKey: "lp.feature_bilingual_title",
    descKey: "lp.feature_bilingual_desc",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    iconShape: "rect",
    icon: <IconGlobe />,
  },
  {
    key: "kb",
    titleKey: "lp.feature_kb_title",
    descKey: "lp.feature_kb_desc",
    iconBg: "bg-yellow-100",
    iconColor: "text-yellow-700",
    iconShape: "circle",
    icon: <IconBookOpen />,
  },
  {
    key: "members",
    titleKey: "lp.feature_members_title",
    descKey: "lp.feature_members_desc",
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    iconShape: "rect",
    icon: <IconUsers />,
  },
]

// ---------------------------------------------------------------------------
// How It Works steps
// ---------------------------------------------------------------------------

type Step = {
  num: number
  titleKey: string
  descKey: string
  icon: React.ReactNode
}

const STEPS: Step[] = [
  { num: 1, titleKey: "lp.how_step1_title", descKey: "lp.how_step1_desc", icon: <IconUpload /> },
  { num: 2, titleKey: "lp.how_step2_title", descKey: "lp.how_step2_desc", icon: <IconSparkles /> },
  { num: 3, titleKey: "lp.how_step3_title", descKey: "lp.how_step3_desc", icon: <IconCheck /> },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type LandingContentProps = {
  /** CTA slot rendered in the hero (e.g. "Sign in" or "Go to Home"). */
  ctaSlot: React.ReactNode
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LandingContent({ ctaSlot }: LandingContentProps) {
  const { t } = useTranslation()

  return (
    <div className="force-light min-h-screen bg-white">
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative min-h-[80vh] overflow-hidden bg-gray-50 flex items-center">
        {/* Decorative shapes */}
        <div
          className="pointer-events-none absolute -top-16 -right-16 h-72 w-72 rounded-full border-4 border-black bg-blue-100 opacity-70"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute bottom-12 -left-10 h-36 w-52 rotate-12 rounded-2xl border-4 border-black bg-yellow-100 opacity-70"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute right-24 top-1/3 h-20 w-20 rounded-full border-4 border-black bg-red-100 opacity-60"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute left-1/4 bottom-24 h-16 w-16 rounded-xl border-4 border-black bg-green-100 opacity-60"
          style={{ clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }}
          aria-hidden="true"
        />

        {/* Content */}
        <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-24 text-center">
          <span className="mb-6 inline-block rounded-full border-2 border-black bg-white px-4 py-1 text-sm font-medium text-gray-700">
            For GDGoC Japan
          </span>

          <h1 className="mb-6 text-5xl font-bold tracking-tight text-gray-900 sm:text-7xl">
            {t("lp.hero_title")}
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-xl text-gray-600">{t("lp.hero_subtitle")}</p>

          {ctaSlot}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Features                                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.key}
              className="flex flex-col gap-3 rounded-2xl border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_#000]"
            >
              <div
                className={`flex h-12 w-12 items-center justify-center border-2 border-black ${f.iconBg} ${f.iconColor} ${f.iconShape === "circle" ? "rounded-full" : "rounded-xl"}`}
              >
                {f.icon}
              </div>
              <h3 className="font-semibold text-gray-900">{t(f.titleKey)}</h3>
              <p className="text-sm text-gray-600">{t(f.descKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* How It Works                                                        */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-gray-100 bg-gray-50 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-gray-900">
            {t("lp.how_title")}
          </h2>

          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-0">
            {STEPS.map((step, idx) => (
              <div key={step.num} className="flex lg:flex-1 lg:flex-col lg:items-center">
                {/* Step + content */}
                <div className="flex items-start gap-4 lg:flex-col lg:items-center lg:text-center">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-black bg-gray-900 text-lg font-bold text-white">
                    {step.num}
                  </div>
                  <div className="lg:mt-4">
                    <h3 className="font-semibold text-gray-900">{t(step.titleKey)}</h3>
                    <p className="mt-1 text-sm text-gray-600">{t(step.descKey)}</p>
                  </div>
                </div>

                {/* Connector (desktop only, not after last step) */}
                {idx < STEPS.length - 1 && (
                  <div
                    className="ml-6 mt-2 hidden h-0 flex-1 border-t-2 border-dashed border-black lg:mx-4 lg:mt-0 lg:block lg:h-auto lg:w-full"
                    aria-hidden="true"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Footer links                                                        */}
      {/* ------------------------------------------------------------------ */}
      <footer className="border-t border-gray-200 px-6 py-8 text-center text-sm text-gray-400">
        <div className="flex justify-center gap-6">
          <Link to="/privacy" className="hover:text-blue-500">
            {t("footer.privacy")}
          </Link>
          <Link to="/terms" className="hover:text-blue-500">
            {t("footer.terms")}
          </Link>
        </div>
      </footer>
    </div>
  )
}

export { GoogleIcon }
