import { Outlet, useNavigate, useLocation, NavLink } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Menu, Bell, LogOut, Settings, Globe, ArrowLeftRight, ArrowLeft,
  Home, Users, BarChart3, GraduationCap, MoreHorizontal, PartyPopper, Settings2,
} from "lucide-react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import ImpersonationBanner from "./ImpersonationBanner";
import ThemeToggle from "./ThemeToggle";
import ErrorBoundary from "./ErrorBoundary";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import i18n, { LANGUAGE_STORAGE_KEY } from "@/i18n";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { writeHrdUiMode } from "@/lib/hrdUiMode";
import { getActiveStudioLabel, STUDIO_MATCH, type StudioKey } from "@/lib/hrdStudios";
import { cn } from "@/lib/utils";

/**
 * Mobile-first HRD shell. Same Today-first логика, что и на десктопе:
 * — Home (Today) с приветствием/KPI/инбоксом рендерится в `<Outlet/>`.
 * — Нижняя навигация: Today, People, Analytics, Learning, More (sheet).
 * — Верхняя шапка: аватар + уведомления + меню (настройки, язык, классический режим, выход).
 */
const MobileHrdLayout = () => {
  const { t } = useTranslation("employee");
  const navigate = useNavigate();
  const location = useLocation();
  const { data: profile } = useUserProfile();
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const unread = useUnreadNotifications();

  const firstName = (profile?.full_name ?? "").split(" ")[0] || "HR";
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "HR";

  const studioLabel = getActiveStudioLabel(location.pathname);
  const isTodayHome = location.pathname === "/today";

  const toggleLang = () => {
    const next = i18n.language?.startsWith("en") ? "ru" : "en";
    i18n.changeLanguage(next);
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch {}
  };

  const switchToClassic = () => {
    writeHrdUiMode("classic");
    window.location.href = "/dashboard";
  };

  const tabs: Array<{ icon: typeof Home; label: string; to: string; match: (p: string) => boolean }> = [
    { icon: Home,          label: "Today",     to: "/today",     match: (p) => p === "/today" },
    { icon: Users,         label: "People",    to: "/users",     match: (p) => STUDIO_MATCH.people.test(p) },
    { icon: BarChart3,     label: "Analytics", to: "/analytics", match: (p) => STUDIO_MATCH.analytics.test(p) },
    { icon: GraduationCap, label: "Learning",  to: "/university",match: (p) => STUDIO_MATCH.learning.test(p) },
  ];

  const moreItems: Array<{ icon: typeof Home; label: string; to: string; key: StudioKey }> = [
    { icon: PartyPopper, label: "Culture — признание, магазин, пульс", to: "/feed",        key: "culture" },
    { icon: Settings2,   label: "Ops — политики, документы, поддержка", to: "/hr-policies", key: "ops" },
  ];

  const moreActive = STUDIO_MATCH.culture.test(location.pathname) || STUDIO_MATCH.ops.test(location.pathname);

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <ImpersonationBanner />

      <header className="sticky top-0 z-40 h-14 bg-card/90 backdrop-blur-md border-b border-border flex items-center justify-between px-3 gap-2">
        {isTodayHome ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
              {initials}
            </div>
            <div className="leading-tight min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{firstName}</p>
              <p className="text-[11px] text-muted-foreground truncate">HR-режим · Today</p>
            </div>
          </div>
        ) : (
          <NavLink
            to="/today"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground min-w-0"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="font-medium text-foreground">Today</span>
            {studioLabel && (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span className="truncate">{studioLabel}</span>
              </>
            )}
          </NavLink>
        )}

        <div className="flex items-center gap-0.5 shrink-0">
          <ThemeToggle />
          <button
            onClick={() => navigate("/notifications")}
            className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Уведомления"
          >
            <Bell className="w-5 h-5 text-muted-foreground" />
            {unread > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
            )}
          </button>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button className="p-2 rounded-lg hover:bg-secondary transition-colors" aria-label="Меню">
                <Menu className="w-5 h-5 text-muted-foreground" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Меню</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-1">
                <MenuItem icon={Settings} label="Настройки" onClick={() => { navigate("/settings"); setMenuOpen(false); }} />
                <MenuItem icon={Globe} label={i18n.language?.startsWith("en") ? "Русский" : "English"} onClick={() => { toggleLang(); setMenuOpen(false); }} />
                <MenuItem icon={ArrowLeftRight} label="Классический режим" onClick={() => { setMenuOpen(false); switchToClassic(); }} />
                <div className="h-px bg-border my-3" />
                <MenuItem icon={LogOut} label="Выйти" onClick={() => { setMenuOpen(false); setLogoutOpen(true); }} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1 p-4 pb-24">
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 h-16 bg-card/95 backdrop-blur-md border-t border-border flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => {
          const active = tab.match(location.pathname);
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1 rounded-lg transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </NavLink>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1 rounded-lg transition-colors",
                moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Ещё"
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-medium">Ещё</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Студии глубокой работы</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-1">
              {moreItems.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.to}
                    onClick={() => { navigate(m.to); setMoreOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary transition-colors text-left"
                  >
                    <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
                    <span className="text-sm text-foreground">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </nav>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти из системы?</AlertDialogTitle>
            <AlertDialogDescription>Вы будете перенаправлены на страницу входа.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Нет</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setLogoutOpen(false);
              void signOut();
              window.location.replace("/login");
            }}>Да, выйти</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const MenuItem = ({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Home;
  label: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors text-left"
  >
    <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
    <span className="text-sm text-foreground">{label}</span>
  </button>
);

export default MobileHrdLayout;
