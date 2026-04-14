import type { ReactNode } from "react";
import { useTheme } from "next-themes";
// @ts-ignore – resolved via vite alias "sonner-original"
import { Toaster as SonnerToaster, toast as baseToast } from "sonner-original";
// @ts-ignore
import type { ExternalToast, ToasterProps } from "sonner-original";

import { cn } from "@/lib/utils";

type SupportedLanguage = "ru" | "en";
type Translation = { ru: string; en: string };
type SonnerToast = typeof import("sonner-original").toast;
type LocalizableContent = string | ReactNode | (() => ReactNode);

const exactTranslations: Translation[] = [
  { ru: "Выберите файл", en: "Choose a file" },
  { ru: "Требуется авторизация", en: "Sign in to continue" },
  { ru: "Подождите, загружается профиль пользователя", en: "Please wait while the user profile is loading" },
  { ru: "Для этой учётной записи не назначена компания", en: "No company is assigned to this account" },
  { ru: "Поддерживаются CSV, XLSX, DOC, DOCX и PDF файлы", en: "Supported file formats: CSV, XLSX, DOC, DOCX, and PDF" },
  { ru: "Поддерживаются форматы: CSV, XLSX, JSON, DOCX, PDF", en: "Supported file formats: CSV, XLSX, JSON, DOCX, and PDF" },
  { ru: "Не удалось создать ссылку на файл", en: "Couldn't create a file link" },
  { ru: "Документ загружен и отправлен на обработку", en: "The document was uploaded and sent for processing" },
  { ru: "Нет данных для создания сценария", en: "There is no data to create a scenario" },
  { ru: "Сценарий оценки создан", en: "The assessment scenario was created" },
  { ru: "Документ удалён", en: "The document was deleted" },
  { ru: "Сценарий загружен", en: "The scenario was uploaded" },
  { ru: "Сценарий удалён", en: "The scenario was deleted" },
];

const technicalTranslations: Array<{ matches: (message: string) => boolean; text: Translation }> = [
  {
    matches: (message) =>
      message.includes('new row violates row-level security policy for table "assessment_scenarios"') ||
      message.includes("new row violates row-level security policy for table 'assessment_scenarios'"),
    text: {
      ru: "Не удалось сохранить сценарий: у пользователя нет нужных прав или не назначена компания.",
      en: "Couldn't save the scenario: the user doesn't have the required access or no company is assigned yet.",
    },
  },
  {
    matches: (message) =>
      message.includes('new row violates row-level security policy for table "hr_documents"') ||
      message.includes("new row violates row-level security policy for table 'hr_documents'"),
    text: {
      ru: "Не удалось загрузить документ: у пользователя нет нужных прав или не назначена компания.",
      en: "Couldn't upload the document: the user doesn't have the required access or no company is assigned yet.",
    },
  },
  {
    matches: (message) => message.includes("row-level security policy"),
    text: {
      ru: "Недостаточно прав для этой операции. Проверьте роль пользователя и назначенную компанию.",
      en: "You don't have permission for this action. Check the user's role and assigned company.",
    },
  },
  {
    matches: (message) => message.includes("failed to fetch") || message.includes("networkerror"),
    text: {
      ru: "Не удалось связаться с сервером. Проверьте сеть и попробуйте ещё раз.",
      en: "Couldn't reach the server. Check your connection and try again.",
    },
  },
  {
    matches: (message) => message.includes("invalid login credentials"),
    text: {
      ru: "Неверный email или пароль.",
      en: "Incorrect email or password.",
    },
  },
  {
    matches: (message) => message.includes("email not confirmed"),
    text: {
      ru: "Подтвердите email, чтобы войти в систему.",
      en: "Please confirm your email before signing in.",
    },
  },
];

const getUserLanguage = (): SupportedLanguage => {
  const languages = [
    ...(typeof navigator !== "undefined" ? navigator.languages ?? [] : []),
    typeof navigator !== "undefined" ? navigator.language : "",
    typeof document !== "undefined" ? document.documentElement.lang : "",
  ]
    .filter(Boolean)
    .map((language) => language.toLowerCase());

  return languages.some((language) => language.startsWith("ru")) ? "ru" : "en";
};

const localizeMessage = (message: string) => {
  const normalizedMessage = message.trim();
  const userLanguage = getUserLanguage();
  const lowerCaseMessage = normalizedMessage.toLowerCase();

  const exactMatch = exactTranslations.find(
    (translation) => translation.ru === normalizedMessage || translation.en === normalizedMessage,
  );
  if (exactMatch) return exactMatch[userLanguage];

  const technicalMatch = technicalTranslations.find(({ matches }) => matches(lowerCaseMessage));
  if (technicalMatch) return technicalMatch.text[userLanguage];

  return normalizedMessage;
};

const localizeContent = <T extends LocalizableContent>(content: T): T => {
  if (typeof content !== "string") return content;
  return localizeMessage(content) as T;
};

const normalizeToastData = (data?: ExternalToast): ExternalToast | undefined => {
  if (!data) return data;

  return {
    ...data,
    description: localizeContent(data.description as LocalizableContent),
    position: "top-center",
  };
};

const normalizePromiseData = <T,>(data: T): T => {
  if (!data || typeof data !== "object") return data;

  const localizedData = { ...(data as Record<string, unknown>) };

  for (const key of ["loading", "success", "error", "description"] as const) {
    const value = localizedData[key];
    if (typeof value === "string") {
      localizedData[key] = localizeMessage(value);
    }
  }

  return localizedData as T;
};

const toast = ((message, data) =>
  baseToast(localizeContent(message as LocalizableContent), normalizeToastData(data))) as SonnerToast;

toast.success = ((message, data) =>
  baseToast.success(localizeContent(message as LocalizableContent), normalizeToastData(data))) as SonnerToast["success"];
toast.info = ((message, data) =>
  baseToast.info(localizeContent(message as LocalizableContent), normalizeToastData(data))) as SonnerToast["info"];
toast.warning = ((message, data) =>
  baseToast.warning(localizeContent(message as LocalizableContent), normalizeToastData(data))) as SonnerToast["warning"];
toast.error = ((message, data) =>
  baseToast.error(localizeContent(message as LocalizableContent), normalizeToastData(data))) as SonnerToast["error"];
toast.loading = ((message, data) =>
  baseToast.loading(localizeContent(message as LocalizableContent), normalizeToastData(data))) as SonnerToast["loading"];
toast.message = ((message, data) =>
  baseToast.message(localizeContent(message as LocalizableContent), normalizeToastData(data))) as SonnerToast["message"];
toast.promise = ((promise, data) => baseToast.promise(promise, normalizePromiseData(data))) as SonnerToast["promise"];
toast.custom = baseToast.custom;
toast.dismiss = baseToast.dismiss;
toast.getHistory = baseToast.getHistory;
toast.getToasts = baseToast.getToasts;

const Toaster = ({ className, toastOptions, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const userLanguage = getUserLanguage();

  return (
    <SonnerToaster
      {...props}
      theme={theme as ToasterProps["theme"]}
      position="top-center"
      visibleToasts={1}
      expand={false}
      containerAriaLabel={userLanguage === "ru" ? "Уведомления" : "Notifications"}
      className={cn("toaster group center-screen-alerts", className)}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast: cn(
            "group toast w-[min(560px,calc(100vw-2rem))] rounded-2xl border border-border bg-background text-foreground shadow-elevated",
            toastOptions?.classNames?.toast,
          ),
          description: cn("group-[.toast]:text-muted-foreground", toastOptions?.classNames?.description),
          actionButton: cn(
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
            toastOptions?.classNames?.actionButton,
          ),
          cancelButton: cn(
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
            toastOptions?.classNames?.cancelButton,
          ),
          title: toastOptions?.classNames?.title,
          closeButton: toastOptions?.classNames?.closeButton,
          success: toastOptions?.classNames?.success,
          error: toastOptions?.classNames?.error,
          info: toastOptions?.classNames?.info,
          warning: toastOptions?.classNames?.warning,
          loading: toastOptions?.classNames?.loading,
          default: toastOptions?.classNames?.default,
          content: toastOptions?.classNames?.content,
          icon: toastOptions?.classNames?.icon,
          loader: toastOptions?.classNames?.loader,
        },
      }}
    />
  );
};

export { Toaster, toast };
