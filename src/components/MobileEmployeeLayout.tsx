import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, MessageSquare, User, Target, Menu, Bell, LogOut, Settings } from "lucide-react";
import { useState } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import ImpersonationBanner from "./ImpersonationBanner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const tabs = [
  { icon: LayoutDashboard, label: "Главная", path: "/" },
  { icon: MessageSquare, label: "Оценка", path: "/assessment" },
  { icon: Target, label: "Трек", path: "/career-track" },
  { icon: User, label: "Паспорт", path: "/passport" },
];

const MobileEmployeeLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: profile } = useUserProfile();
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "??";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ImpersonationBanner />
      {/* Top bar */}
      <header className="sticky top-0 z-40 h-14 bg-card/90 backdrop-blur-md border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-semibold">
            {initials}
          </div>
          <div className="leading-tight">
            <p className="text-sm font-medium text-foreground truncate max-w-[160px]">{profile?.full_name?.split(" ")[0] || "Сотрудник"}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[160px]">{profile?.position || "Сотрудник"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate("/notifications")}
            className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Уведомления"
          >
            <Bell className="w-5 h-5 text-muted-foreground" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
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
                <MenuItem icon={Bell} label="Уведомления" onClick={() => { navigate("/notifications"); setMenuOpen(false); }} />
                <MenuItem icon={Settings} label="Настройки" onClick={() => { navigate("/settings"); setMenuOpen(false); }} />
                
                <div className="h-px bg-border my-3" />
                <MenuItem icon={LogOut} label="Выйти" onClick={async () => { await signOut(); navigate("/login"); }} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 pb-24">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-40 h-16 bg-card/95 backdrop-blur-md border-t border-border flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((t) => {
          const isActive = location.pathname === t.path;
          const Icon = t.icon;
          return (
            <button
              key={t.path}
              onClick={() => navigate(t.path)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-lg transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "scale-110" : ""} transition-transform`} />
              <span className="text-[11px] font-medium">{t.label}</span>
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
