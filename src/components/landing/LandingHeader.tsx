import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import brandLogo from "@/assets/logo-growth-peak.png";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";

interface Props {
  onOpenDemo?: () => void;
  showAnchors?: boolean;
}

const LandingHeader = ({ onOpenDemo, showAnchors = true }: Props) => {
  const { t } = useTranslation(["landing", "common"]);

  return (
    <header
      data-testid="landing-header"
      className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border text-foreground"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src={brandLogo} alt={t("common:brand.logoAlt")} width={36} height={36} className="w-9 h-9 object-contain" />
          <span className="font-bold text-base tracking-tight text-foreground leading-none">
            {t("common:brand.name")}
          </span>
        </Link>

        {showAnchors && (
          <nav className="hidden lg:flex items-center gap-6 xl:gap-8 text-sm text-muted-foreground">
            <a href="#pains" className="hover:text-foreground transition-colors">{t("landing:header.solutions")}</a>
            <a href="#features" className="hover:text-foreground transition-colors">{t("landing:header.tools")}</a>
            <a href="#roles" className="hover:text-foreground transition-colors">{t("landing:header.stories")}</a>
            <a href="#faq" className="hover:text-foreground transition-colors">{t("landing:header.faq")}</a>
            <Link to="/pricing" className="hover:text-foreground transition-colors">{t("landing:header.pricing")}</Link>
          </nav>
        )}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
          {onOpenDemo && (
            <button
              onClick={onOpenDemo}
              className="hidden sm:inline-flex px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-secondary transition-colors"
            >
              {t("landing:header.requestDemo")}
            </button>
          )}
          <Link
            to="/login"
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            {t("landing:header.signIn")}
          </Link>
        </div>
      </div>
    </header>
  );
};

export default LandingHeader;
