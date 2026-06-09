import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import ruCommon from "./locales/ru/common.json";
import enCommon from "./locales/en/common.json";
import ruAuth from "./locales/ru/auth.json";
import enAuth from "./locales/en/auth.json";
import ruLanding from "./locales/ru/landing.json";
import enLanding from "./locales/en/landing.json";

export const SUPPORTED_LANGUAGES = ["ru", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "ct-lang";

const resources = {
  ru: { common: ruCommon, auth: ruAuth, landing: ruLanding },
  en: { common: enCommon, auth: enAuth, landing: enLanding },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "ru",
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    ns: ["common", "auth", "landing"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
    returnNull: false,
    returnObjects: true,
  });

const applyHtmlLang = (lng: string) => {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", lng);
  }
};
applyHtmlLang(i18n.language);
i18n.on("languageChanged", applyHtmlLang);

export default i18n;
