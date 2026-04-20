import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePrimaryRole, useUserProfile } from "@/hooks/useUserProfile";
import {
  LayoutDashboard,
  MessageSquare,
  User,
  Target,
  Bell,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Users,
  Shield,
  LifeBuoy,
  FileJson,
  BarChart3,
  UserCog,
  AlertTriangle,
  Route,
  Trophy,
  ClipboardList,
  ShoppingBag,
  Store,
} from "lucide-react";

interface NavItem {
  icon: any;
  label: string;
  path: string;
  badge?: number;
}

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const AppSidebar = ({ collapsed, onToggle }: AppSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const role = usePrimaryRole();
  const { data: profile } = useUserProfile();

  const getNavItems = (): NavItem[] => {
    const common: NavItem[] = [
      { icon: LayoutDashboard, label: "Дашборд", path: "/" },
    ];

    if (role === "superadmin") {
      return [
        ...common,
        { icon: Shield, label: "Компании", path: "/companies" },
        { icon: UserCog, label: "Пользователи", path: "/users" },
        { icon: LifeBuoy, label: "Обращения", path: "/support" },
        { icon: Settings, label: "Настройки", path: "/settings" },
      ];
    }

    if (role === "company_admin") {
      return [
        ...common,
        { icon: UserCog, label: "Пользователи", path: "/users" },
        { icon: Users, label: "Сотрудники", path: "/employees" },
        { icon: BarChart3, label: "Аналитика", path: "/analytics" },
        { icon: Briefcase, label: "Должности", path: "/positions" },
        { icon: LifeBuoy, label: "Обращения", path: "/support" },
        { icon: Settings, label: "Настройки", path: "/settings" },
      ];
    }

    if (role === "hrd") {
      return [
        ...common,
        { icon: Users, label: "Сотрудники", path: "/employees" },
        { icon: BarChart3, label: "Аналитика", path: "/analytics" },
        { icon: FileJson, label: "Сценарии оценки", path: "/scenarios" },
        { icon: ClipboardList, label: "Тесты", path: "/tests" },
        { icon: Briefcase, label: "Должности", path: "/positions" },
        { icon: Route, label: "Карьерные треки", path: "/career-tracks-mgmt" },
        { icon: ClipboardList, label: "Проверка этапов", path: "/career-reviews" },
        { icon: Trophy, label: "Геймификация", path: "/gamification" },
      { icon: Store, label: "Магазин и валюта", path: "/shop-admin" },
      { icon: Shield, label: "Политики", path: "/hr-policies" },
      { icon: Settings, label: "Настройки", path: "/settings" },
    ];
  }

  if (role === "manager") {
    return [
      ...common,
      { icon: Users, label: "Моя команда", path: "/team" },
      { icon: ClipboardList, label: "Проверка этапов", path: "/career-reviews" },
      { icon: Settings, label: "Настройки", path: "/settings" },
    ];
  }

  // Employee
  return [
    ...common,
    { icon: MessageSquare, label: "AI Оценка", path: "/assessment" },
    { icon: User, label: "Цифровой паспорт", path: "/passport" },
    { icon: Target, label: "Карьерный трек", path: "/career-track" },
    { icon: ShoppingBag, label: "Магазин", path: "/shop" },
    { icon: Bell, label: "Уведомления", path: "/notifications" },
    { icon: Settings, label: "Настройки", path: "/settings" },
  ];
};

  const navItems = getNavItems();

  const roleLabels: Record<string, string> = {
    employee: "Сотрудник",
    manager: "Руководитель",
    hrd: "HRD",
    company_admin: "Админ компании",
    superadmin: "Суперадмин",
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 z-50 ${
        collapsed ? "w-[72px]" : "w-[260px]"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
          <Briefcase className="w-4 h-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="font-bold text-base tracking-tight">Карьерный трек</span>
        )}
      </div>

      {/* Role badge */}
      {!collapsed && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-sidebar-accent/50">
          <p className="text-xs text-sidebar-foreground/50">Роль</p>
          <p className="text-sm font-medium text-sidebar-primary">{roleLabels[role]}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path + item.label}
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
              {item.badge && (
                <span className={`absolute ${collapsed ? "top-1 right-1" : "right-3"} w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        {!collapsed && profile && (
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{profile.full_name}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate">{profile.position || "Не указана"}</p>
          </div>
        )}
        <button onClick={() => { signOut(); navigate("/login"); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors ${collapsed ? "justify-center" : ""}`}>
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Выйти</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border shadow-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </aside>
  );
};

export default AppSidebar;
