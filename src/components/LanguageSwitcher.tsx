import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";

const LANGUAGE_LABELS: Record<SupportedLanguage, { native: string; short: string }> = {
  ru: { native: "Русский", short: "RU" },
  en: { native: "English", short: "EN" },
};

interface LanguageSwitcherProps {
  variant?: "compact" | "full";
}

const LanguageSwitcher = ({ variant = "compact" }: LanguageSwitcherProps) => {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || "ru").slice(0, 2) as SupportedLanguage;
  const safeCurrent: SupportedLanguage = (SUPPORTED_LANGUAGES as readonly string[]).includes(current)
    ? current
    : "ru";

  const handleChange = (lng: SupportedLanguage) => {
    if (lng !== safeCurrent) i18n.changeLanguage(lng);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("language.switch")}
          className="inline-flex items-center gap-1.5 px-2 md:px-3 py-2 rounded-lg hover:bg-secondary transition-colors text-xs md:text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Languages className="w-4 h-4" />
          <span className="uppercase tracking-wide">{LANGUAGE_LABELS[safeCurrent].short}</span>
          {variant === "full" && (
            <span className="hidden md:inline">{LANGUAGE_LABELS[safeCurrent].native}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {SUPPORTED_LANGUAGES.map((lng) => (
          <DropdownMenuItem
            key={lng}
            onClick={() => handleChange(lng)}
            className={lng === safeCurrent ? "bg-secondary font-medium" : ""}
          >
            <span className="uppercase text-xs text-muted-foreground mr-2">{LANGUAGE_LABELS[lng].short}</span>
            <span>{LANGUAGE_LABELS[lng].native}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;
