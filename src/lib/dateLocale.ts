import { ru, enUS } from "date-fns/locale";
import i18n from "@/i18n";

export const getDateLocale = () => (i18n.language?.startsWith("en") ? enUS : ru);
export const getIntlLocale = () => (i18n.language?.startsWith("en") ? "en-US" : "ru-RU");
