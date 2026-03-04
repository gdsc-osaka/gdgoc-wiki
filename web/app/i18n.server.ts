import { RemixI18Next } from "remix-i18next/server"
import enCommon from "../public/locales/en/common.json"
import jaCommon from "../public/locales/ja/common.json"
import { defaultNS, fallbackLng, supportedLngs } from "./i18n"

export const i18nextServer = new RemixI18Next({
  detection: { supportedLanguages: [...supportedLngs], fallbackLanguage: fallbackLng },
  i18next: {
    defaultNS,
    fallbackLng,
    resources: { ja: { common: jaCommon }, en: { common: enCommon } },
  },
})
