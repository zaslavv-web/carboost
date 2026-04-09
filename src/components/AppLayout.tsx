import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import ImpersonationBanner from "./ImpersonationBanner";
import { Bell, Search, Menu } from "lucide-react";
import { useUserProfile, usePrimaryRole } from "@/hooks/useUserProfile";

const SIDEBAR_FULL = 260;
const SIDEBAR_COLLAPSED = 72;
const COLLAPSE_BREAKPOINT = 1024;

const AppLayout = () => {
  const { data: profile } = useUserProfile();
  const role = usePrimaryRole();
  const roleLabels: Record<string, string> = { employee: "Сотрудник", manager: "Руководитель", hrd: "Администратор HRD", superadmin: "Суперадмин", company_admin: "Админ компании" };
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "??";

  const [collapsed, setCollapsed] = useState(() => window.innerWidth < COLLAPSE_BREAKPOINT);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${COLLAPSE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_FULL;

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="transition-all duration-300" style={{ marginLeft: sidebarWidth }}>
        <ImpersonationBanner />
        <header className="sticky top-0 z-40 h-16 bg-card/80 backdrop-blur-md border-b border-border flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="lg:hidden p-2 rounded-lg hover:bg-secondary transition-colors"
            >
              <Menu className="w-5 h-5 text-muted-foreground" />
            </button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Поиск..."
                className="pl-10 pr-4 py-2 w-48 md:w-72 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">
                {initials}
              </div>
              <div className="text-sm hidden md:block">
                <p className="font-medium text-foreground">{profile?.full_name || "Загрузка..."}</p>
                <p className="text-muted-foreground text-xs">{profile?.position || roleLabels[role]}</p>
              </div>
            </div>
          </div>
        </header>
        <main className="p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
