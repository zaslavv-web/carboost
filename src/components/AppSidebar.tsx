import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePrimaryRole, useUserProfile } from "@/hooks/useUserProfile";
import { useState } from "react";
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
  ChevronDown,
  X,
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
  Rocket,
  Mail,
  Heart,
  Activity,
  ClipboardCheck,
  Banknote,
} from "lucide-react";
import brandLogo from "@/assets/logo-growth-peak.png";

interface NavItem {
  icon: any;
  label: string;
  path: string;
  badge?: number;
}

interface NavGroup {
  icon: any;
  label: string;
  children: NavItem[];
}

type NavEntry = NavItem | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => "children" in e;

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onHide?: () => void;
  isMobile?: boolean;
}

const AppSidebar = ({ collapsed, onToggle, onHide, isMobile }: AppSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const role = usePrimaryRole();
  const { data: profile } = useUserProfile();

  const getNavItems = (): NavEntry[] => {
    const common: NavItem[] = [
      { icon: LayoutDashboard, label: "Дашборд", path: "/dashboard" },
    ];

    if (role === "superadmin") {
      return [
        ...common,
        { icon: Shield, label: "Компании", path: "/companies" },
        { icon: UserCog, label: "Пользователи", path: "/users" },
        { icon: LifeBuoy, label: "Обращения", path: "/support" },
        { icon: Banknote, label: "Заявки на тарифы", path: "/pricing-inquiries" },
        { icon: Mail, label: "Почтовый сервис", path: "/email-settings" },
        { icon: Settings, label: "Настройки", path: "/settings" },
      ];
    }

    if (role === "company_admin") {
      return [
        ...common,
        { icon: Rocket, label: "Запуск компании", path: "/onboarding" },
        { icon: Mail, label: "Приглашения", path: "/invitations" },
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
        {
          icon: Users,
          label: "Сотрудники",
          children: [
            { icon: Users, label: "Список сотрудников", path: "/employees" },
            { icon: Mail, label: "Приглашения", path: "/invitations" },
            { icon: Rocket, label: "Запуск компании", path: "/onboarding" },
          ],
        },
        {
          icon: BarChart3,
          label: "Аналитика",
          children: [
            { icon: BarChart3, label: "Общая аналитика", path: "/analytics" },
            { icon: Activity, label: "Риски и удержание", path: "/risk-analytics" },
          ],
        },
        {
          icon: ClipboardList,
          label: "Оценка и тесты",
          children: [
            { icon: FileJson, label: "Сценарии оценки", path: "/scenarios" },
            { icon: ClipboardList, label: "Тесты", path: "/tests" },
            { icon: ClipboardList, label: "Проверка этапов", path: "/career-reviews" },
          ],
        },
        {
          icon: Route,
          label: "Карьера",
          children: [
            { icon: Briefcase, label: "Должности", path: "/positions" },
            { icon: Route, label: "Карьерные треки", path: "/career-tracks-mgmt" },
          ],
        },
        {
          icon: Trophy,
          label: "Вовлечённость",
          children: [
            { icon: Trophy, label: "Геймификация", path: "/gamification" },
            { icon: Heart, label: "Лента признания", path: "/recognition" },
            { icon: Store, label: "Магазин и валюта", path: "/shop-admin" },
          ],
        },
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
    { icon: ClipboardCheck, label: "Анкета", path: "/employee-questionnaire" },
    { icon: User, label: "Цифровой паспорт", path: "/passport" },
    { icon: Target, label: "Карьерный трек", path: "/career-track" },
    { icon: Heart, label: "Признание коллег", path: "/recognition" },
    { icon: ShoppingBag, label: "Магазин", path: "/shop" },
    { icon: Bell, label: "Уведомления", path: "/notifications" },
    { icon: Settings, label: "Настройки", path: "/settings" },
  ];
};

  const navItems = getNavItems();

  // Группы, в которых открыт активный маршрут — раскрыты по умолчанию
  const initialOpen: Record<string, boolean> = {};
  navItems.forEach((e) => {
    if (isGroup(e) && e.children.some((c) => c.path === location.pathname)) {
      initialOpen[e.label] = true;
    }
  });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);
  const toggleGroup = (label: string) =>
    setOpenGroups((p) => ({ ...p, [label]: !p[label] }));

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
        <img
          src={brandLogo}
          alt="Пик Роста"
          width={32}
          height={32}
          className="w-8 h-8 flex-shrink-0 object-contain"
        />
        {!collapsed && (
          <div className="leading-tight">
            <span className="block font-bold text-base tracking-tight">Пик Роста</span>
            <span className="block text-[10px] font-medium tracking-[0.15em] text-sidebar-foreground/50 uppercase">Growth Peak</span>
          </div>
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
        {navItems.map((entry) => {
          if (isGroup(entry)) {
            const hasActive = entry.children.some((c) => c.path === location.pathname);
            const isOpen = collapsed ? false : (openGroups[entry.label] ?? hasActive);
            return (
              <div key={"group:" + entry.label}>
                <button
                  onClick={() => {
                    if (collapsed) {
                      // в свёрнутом режиме клик по группе — переход к первому пункту
                      navigate(entry.children[0].path);
                      if (isMobile) onHide?.();
                    } else {
                      toggleGroup(entry.label);
                    }
                  }}
                  title={collapsed ? entry.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    hasActive
                      ? "text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-primary/40 hover:text-sidebar-primary-foreground"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <entry.icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{entry.label}</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </>
                  )}
                </button>
                {!collapsed && isOpen && (
                  <div className="mt-1 ml-3 pl-3 border-l border-sidebar-border space-y-1">
                    {entry.children.map((child) => {
                      const childActive = location.pathname === child.path;
                      return (
                        <button
                          key={child.path + child.label}
                          onClick={() => {
                            navigate(child.path);
                            if (isMobile) onHide?.();
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                            childActive
                              ? "bg-sidebar-primary text-sidebar-primary-foreground"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                          }`}
                        >
                          <child.icon className="w-4 h-4 flex-shrink-0" />
                          <span>{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const item = entry;
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path + item.label}
              onClick={() => {
                navigate(item.path);
                if (isMobile) onHide?.();
              }}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
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
        <button onClick={() => { signOut(); navigate("/login"); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-primary hover:text-sidebar-primary-foreground transition-colors ${collapsed ? "justify-center" : ""}`}>
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Выйти</span>}
        </button>
      </div>

      {/* Sidebar controls */}
      {isMobile ? (
        <button
          onClick={onHide}
          className="absolute right-3 top-3 w-10 h-10 rounded-lg bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground transition-colors flex items-center justify-center"
          aria-label="Скрыть меню"
        >
          <X className="w-5 h-5" />
        </button>
      ) : (
        <button
          onClick={onToggle}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border shadow-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      )}
    </aside>
  );
};

export default AppSidebar;
