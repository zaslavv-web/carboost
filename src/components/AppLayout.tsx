import { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import ImpersonationBanner from "./ImpersonationBanner";
import { Bell, Search, Menu, PanelLeftOpen } from "lucide-react";
import { useUserProfile, usePrimaryRole } from "@/hooks/useUserProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import ThemeToggle from "./ThemeToggle";

const SIDEBAR_FULL = 260;
const SIDEBAR_COLLAPSED = 72;
const COLLAPSE_BREAKPOINT = 1024;

const AppLayout = () => {
  const { data: profile } = useUserProfile();
  const role = usePrimaryRole();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const roleLabels: Record<string, string> = { employee: "Сотрудник", manager: "Руководитель", hrd: "Администратор HRD", superadmin: "Суперадмин", company_admin: "Админ компании" };
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

  return (
    <div className="min-h-screen bg-background">
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
          hidden ? "-translate-x-full" : "translate-x-0"
        }`}
      >
        <AppSidebar
          collapsed={!isMobile && collapsed}
          onToggle={toggleSidebar}
          onHide={() => setHidden(true)}
        />
      </div>

      <div className="transition-all duration-300" style={{ marginLeft: sidebarWidth }}>
        <ImpersonationBanner />
        <header className="sticky top-0 z-40 h-14 md:h-16 bg-card/80 backdrop-blur-md border-b border-border flex items-center justify-between px-3 md:px-8">
          <div className="flex items-center gap-2 md:gap-3">
            {hidden && (
              <button
                onClick={() => setHidden(false)}
                className="p-2 rounded-lg hover:bg-secondary transition-colors"
                aria-label="Показать меню"
              >
                <PanelLeftOpen className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Поиск..."
                className="pl-10 pr-4 py-2 w-48 md:w-72 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-3">
            <ThemeToggle />
            <button onClick={() => navigate("/notifications")} className="relative p-2 rounded-lg hover:bg-secondary transition-colors">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive animate-glow-pulse" />
            </button>
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs md:text-sm font-semibold">
                {initials}
              </div>
              <div className="text-sm hidden md:block">
                <p className="font-medium text-foreground">{profile?.full_name || "Загрузка..."}</p>
                <p className="text-muted-foreground text-xs">{profile?.position || roleLabels[role]}</p>
              </div>
            </div>
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
