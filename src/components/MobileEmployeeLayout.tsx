import { Outlet, useNavigate, useLocation } from "react-router-dom";
import ChatLauncher from "./chat/ChatLauncher";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  MessageSquare,
  User,
  Target,
  Menu,
  Bell,
  LogOut,
  Settings,
  Globe,
  ListChecks,
  CalendarDays,
  Award,
  BookOpen,
} from "lucide-react";
import { useState } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import ImpersonationBanner from "./ImpersonationBanner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import i18n, { SUPPORTED_LANGUAGES, LANGUAGE_STORAGE_KEY } from "@/i18n";
import ThemeToggle from "./ThemeToggle";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Mobile Employee shell — принцип "Только Today + бургер".
 * Главный экран (/dashboard) — Today. Вся остальная навигация переехала в бургер,
 * чтобы убрать визуальный шум и типовые "куда нажать сначала" сомнения.
 */
const MobileEmployeeLayout = () => {
  const { t } = useTranslation("employee");
  const navigate = useNavigate();
  const location = useLocation();
  const { data: profile } = useUserProfile();
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const unreadCount = useUnreadNotifications();

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "??";

  const toggleLang = () => {
    const next = i18n.language?.startsWith("en") ? "ru" : "en";
    i18n.changeLanguage(next);
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch {}
  };

  const go = (path: string) => { navigate(path); setMenuOpen(false); };

  const onToday = location.pathname === "/dashboard" || location.pathname === "/";
  const showBackToToday = !onToday;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <ImpersonationBanner />
      <header className="sticky top-0 z-40 h-14 bg-card/90 backdrop-blur-md border-b border-border flex items-center justify-between px-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 min-w-0"
          aria-label="На главный экран"
        >
          <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
            {initials}
          </div>
          <div className="leading-tight text-left min-w-0">
            <p className="text-sm font-medium text-foreground truncate max-w-[160px]">
              {showBackToToday ? "← Today" : profile?.full_name?.split(" ")[0] || t("mobileNav.employee")}
            </p>
            <p className="text-xs text-muted-foreground truncate max-w-[160px]">
              {profile?.position || t("mobileNav.position")}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            onClick={() => navigate("/notifications")}
            className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
            aria-label={t("mobileNav.notifications")}
          >
            <Bell className="w-5 h-5 text-muted-foreground" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
            )}
          </button>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button className="p-2 rounded-lg hover:bg-secondary transition-colors" aria-label={t("mobileNav.menu")}>
                <Menu className="w-5 h-5 text-muted-foreground" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>Меню</SheetTitle>
              </SheetHeader>

              <div className="mt-4">
                <SectionLabel>Ежедневное</SectionLabel>
                <MenuItem icon={LayoutDashboard} label="Today" active={onToday} onClick={() => go("/dashboard")} />
                <MenuItem icon={ListChecks} label="Мои задачи" onClick={() => go("/tracker/my-backlog")} />
                <MenuItem icon={MessageSquare} label="Чаты" onClick={() => go("/chats")} />
                <MenuItem icon={Bell} label="Уведомления" onClick={() => go("/notifications")} badge={unreadCount} />
              </div>

              <div className="mt-4">
                <SectionLabel>Рост</SectionLabel>
                <MenuItem icon={User} label="Мой паспорт" onClick={() => go("/passport")} />
                <MenuItem icon={Target} label="Карьерный трек" onClick={() => go("/career-track")} />
                <MenuItem icon={Award} label="Оценка" onClick={() => go("/assessment")} />
                <MenuItem icon={BookOpen} label="Обучение" onClick={() => go("/university")} />
                <MenuItem icon={CalendarDays} label="Отпуска" onClick={() => go("/leaves")} />
              </div>

              <div className="mt-4">
                <SectionLabel>Аккаунт</SectionLabel>
                <MenuItem icon={Settings} label="Настройки" onClick={() => go("/settings")} />
                <MenuItem icon={Globe} label={i18n.language?.startsWith("en") ? "Русский" : "English"} onClick={() => { toggleLang(); setMenuOpen(false); }} />
                <div className="h-px bg-border my-2" />
                <MenuItem icon={LogOut} label={t("mobileNav.logout")} onClick={() => { setMenuOpen(false); setLogoutOpen(true); }} />
              </div>
            </SheetContent>
          </Sheet>
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
                  setMenuOpen(false);
                  void signOut();
                  window.location.replace("/login");
                }}>Да, выйти</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <main className="flex-1 p-4 pb-24">
        <Outlet />
      </main>

      <ChatLauncher />
    </div>
  );
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">{children}</div>
);

const MenuItem = ({
  icon: Icon,
  label,
  onClick,
  active,
  badge,
}: {
  icon: any;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: number;
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
      active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary"
    }`}
  >
    <span className="flex items-center gap-3">
      <Icon className={`w-5 h-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
      <span>{label}</span>
    </span>
    {badge && badge > 0 ? (
      <span className="text-[10px] font-semibold rounded-full bg-destructive text-destructive-foreground px-1.5 py-0.5 min-w-[18px] text-center">
        {badge > 99 ? "99+" : badge}
      </span>
    ) : null}
  </button>
);

export default MobileEmployeeLayout;

// silence unused import warning when SUPPORTED_LANGUAGES isn't referenced
void SUPPORTED_LANGUAGES;
