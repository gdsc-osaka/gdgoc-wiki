import i18next from "i18next"
import { StrictMode, startTransition } from "react"
import { hydrateRoot } from "react-dom/client"
import { initReactI18next } from "react-i18next"
import { HydratedRouter } from "react-router/dom"
import enCommon from "../public/locales/en/common.json"
import jaCommon from "../public/locales/ja/common.json"
import { defaultNS, fallbackLng, supportedLngs } from "./i18n"

const savedLang = localStorage.getItem("ui_lang")

await i18next.use(initReactI18next).init({
  lng: savedLang || document.documentElement.lang || fallbackLng,
  fallbackLng,
  supportedLngs: [...supportedLngs],
  defaultNS,
  resources: { ja: { common: jaCommon }, en: { common: enCommon } },
  interpolation: { escapeValue: false },
})

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  )
})
