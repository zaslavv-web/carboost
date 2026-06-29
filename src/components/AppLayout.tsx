import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AppSidebar from "./AppSidebar";
import ImpersonationBanner from "./ImpersonationBanner";
import { Bell, PanelLeftOpen } from "lucide-react";
import { useUserProfile, usePrimaryRole } from "@/hooks/useUserProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import ThemeToggle from "./ThemeToggle";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";

const SIDEBAR_FULL = 240;
const SIDEBAR_COLLAPSED = 64;
const COLLAPSE_BREAKPOINT = 1024;

const AppLayout = () => {
  const { data: profile } = useUserProfile();
  const role = usePrimaryRole();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const unreadCount = useUnreadNotifications();
  const roleLabels: Record<string, string> = {
    employee: t("roles.employee"),
    manager: t("roles.manager"),
    hrd: t("roles.hrdLong"),
    superadmin: t("roles.superadmin"),
    company_admin: t("roles.company_admin"),
  };
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "??";

  const [collapsed, setCollapsed] = useState(() => window.innerWidth < COLLAPSE_BREAKPOINT);
  // Sidebar fully hidden (off-canvas). Defaults to hidden on mobile.
  const [hidden, setHidden] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${COLLAPSE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Auto-hide sidebar when entering mobile viewport.
  useEffect(() => {
    if (isMobile) setHidden(true);
  }, [isMobile]);

  // Auto-hide sidebar on every route change while on mobile.
  useEffect(() => {
    if (isMobile) setHidden(true);
  }, [location.pathname, isMobile]);

  // Lock body scroll while sidebar is open over content on mobile.
  useEffect(() => {
    if (isMobile && !hidden) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [isMobile, hidden]);

  const sidebarWidth = hidden ? 0 : isMobile ? 0 : collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_FULL;

  const toggleSidebar = () => {
    if (isMobile) {
      setHidden((h) => !h);
    } else {
      // On desktop: collapsed → expanded → hidden → expanded ...
      // Simpler: toggle collapsed; arrow handles hide separately via onHide.
      setCollapsed((c) => !c);
    }
  };

  const isSandbox = import.meta.env.VITE_APP_ENV === "sandstorm";

  return (
    <div className="min-h-screen bg-background">
      {isSandbox && (
        <div className="sticky top-0 z-[80] bg-warning text-warning-foreground text-xs md:text-sm font-medium text-center py-1.5 px-3">
          {t("layout.sandboxBanner")}
        </div>
      )}
      {/* Backdrop when sidebar is shown over content (mobile or hidden-toggle on desktop) */}
      {!hidden && isMobile && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
          onClick={() => setHidden(true)}
        />
      )}

      {/* Sidebar (always rendered, slides off-canvas when hidden) */}
      <div
        className={`fixed left-0 top-0 h-screen z-[70] transition-transform duration-300 ${
          hidden ? "-translate-x-[calc(100%+1rem)] pointer-events-none" : "translate-x-0"
        }`}
        style={{ width: isMobile ? SIDEBAR_FULL : collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_FULL }}
      >
        <AppSidebar
          collapsed={!isMobile && collapsed}
          onToggle={toggleSidebar}
          onHide={() => setHidden(true)}
          isMobile={isMobile}
        />
      </div>

      <div className="transition-all duration-300" style={{ marginLeft: sidebarWidth }}>
        <ImpersonationBanner />
        {/* Минимальная шапка: только триггер сайдбара (если скрыт), тема и уведомления.
            Поиск/язык/профиль перенесены в сайдбар. */}
        <header className="sticky top-0 z-40 h-12 bg-background/70 backdrop-blur-md border-b border-border/60 flex items-center justify-between px-3 md:px-6">
          <div className="flex items-center gap-2">
            {hidden && (
              <button
                onClick={() => setHidden(false)}
                className="p-2 rounded-lg hover:bg-secondary transition-colors"
                aria-label={t("layout.showMenu")}
              >
                <PanelLeftOpen className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={() => navigate("/notifications")}
              className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
              aria-label={t("actions.notifications", "Уведомления")}
            >
              <Bell className="w-5 h-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive animate-glow-pulse" />
              )}
            </button>
          </div>
        </header>
        <main className="p-3 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
