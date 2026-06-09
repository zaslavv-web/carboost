import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, MessageSquare, User, Target, Menu, Bell, LogOut, Settings, Globe } from "lucide-react";
import { useState } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import ImpersonationBanner from "./ImpersonationBanner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import i18n, { SUPPORTED_LANGUAGES, LANGUAGE_STORAGE_KEY } from "@/i18n";

const MobileEmployeeLayout = () => {
  const { t } = useTranslation("employee");
  const navigate = useNavigate();
  const location = useLocation();
  const { data: profile } = useUserProfile();
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const tabs = [
    { icon: LayoutDashboard, label: t("mobileNav.home"), path: "/dashboard" },
    { icon: MessageSquare, label: t("mobileNav.assessment"), path: "/assessment" },
    { icon: Target, label: t("mobileNav.track"), path: "/career-track" },
    { icon: User, label: t("mobileNav.passport"), path: "/passport" },
  ];

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "??";

  const toggleLang = () => {
    const next = i18n.language?.startsWith("en") ? "ru" : "en";
    i18n.changeLanguage(next);
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch {}
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ImpersonationBanner />
      <header className="sticky top-0 z-40 h-14 bg-card/90 backdrop-blur-md border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-semibold">
            {initials}
          </div>
          <div className="leading-tight">
            <p className="text-sm font-medium text-foreground truncate max-w-[160px]">{profile?.full_name?.split(" ")[0] || t("mobileNav.employee")}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[160px]">{profile?.position || t("mobileNav.position")}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate("/notifications")}
            className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
            aria-label={t("mobileNav.notifications")}
          >
            <Bell className="w-5 h-5 text-muted-foreground" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
          </button>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button className="p-2 rounded-lg hover:bg-secondary transition-colors" aria-label={t("mobileNav.menu")}>
                <Menu className="w-5 h-5 text-muted-foreground" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>{t("mobileNav.menu")}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-1">
                <MenuItem icon={Bell} label={t("mobileNav.notifications")} onClick={() => { navigate("/notifications"); setMenuOpen(false); }} />
                <MenuItem icon={Settings} label={t("mobileNav.settings")} onClick={() => { navigate("/settings"); setMenuOpen(false); }} />
                <MenuItem icon={Globe} label={(i18n.language?.startsWith("en") ? "Русский" : "English")} onClick={() => { toggleLang(); setMenuOpen(false); }} />
                <div className="h-px bg-border my-3" />
                <MenuItem icon={LogOut} label={t("mobileNav.logout")} onClick={async () => { await signOut(); navigate("/login"); }} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1 p-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 h-16 bg-card/95 backdrop-blur-md border-t border-border flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          const Icon = tab.icon;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-lg transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "scale-110" : ""} transition-transform`} />
              <span className="text-[11px] font-medium">{tab.label}</span>
              {isActive && <span className="absolute top-0 w-8 h-0.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

const MenuItem = ({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors"
  >
    <Icon className="w-5 h-5 text-muted-foreground" />
    <span>{label}</span>
  </button>
);

export default MobileEmployeeLayout;

// silence unused import warning when SUPPORTED_LANGUAGES isn't referenced
void SUPPORTED_LANGUAGES;
