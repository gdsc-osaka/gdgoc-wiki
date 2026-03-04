import i18next from "i18next"
import { StrictMode, startTransition } from "react"
import { hydrateRoot } from "react-dom/client"
import { initReactI18next } from "react-i18next"
import { HydratedRouter } from "react-router/dom"
import enCommon from "../public/locales/en/common.json"
import jaCommon from "../public/locales/ja/common.json"
import { defaultNS, fallbackLng, supportedLngs } from "./i18n"

// Initialize with the SSR locale so hydration matches the server-rendered HTML.
i18next
  .use(initReactI18next)
  .init({
    lng: document.documentElement.lang || fallbackLng,
    fallbackLng,
    supportedLngs: [...supportedLngs],
    defaultNS,
    resources: { ja: { common: jaCommon }, en: { common: enCommon } },
    interpolation: { escapeValue: false },
  })
  .then(() => {
    startTransition(() => {
      hydrateRoot(
        document,
        <StrictMode>
          <HydratedRouter />
        </StrictMode>,
      )
    })

    // After hydration, apply any localStorage preference that differs from the SSR locale.
    const savedLang = localStorage.getItem("ui_lang")
    if (savedLang && savedLang !== i18next.language) {
      i18next.changeLanguage(savedLang)
    }
  })
