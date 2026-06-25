import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePrimaryRole, useUserProfile } from "@/hooks/useUserProfile";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  MessageSquare,
  MessageCircle,
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
  CalendarDays,
  Star,
  AlertOctagon,
  TimerReset,
  Palette,
  Brain,
  BookText,
  GraduationCap,
  Crosshair,
} from "lucide-react";
import brandLogo from "@/assets/logo-growth-peak.png";
import { useBranding } from "@/contexts/BrandingContext";

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

interface NavSection {
  key: string;
  label: string;
  entries: NavEntry[];
}

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
  const { t } = useTranslation();
  const { activeLogoUrl } = useBranding();

  const getSections = (): NavSection[] => {
    const S = (key: string) => t(`nav.sections.${key}`);
    const dashboard: NavItem = { icon: LayoutDashboard, label: t("nav.dashboard"), path: "/dashboard" };
    const tracker: NavItem = { icon: Crosshair, label: t("nav.tracker", { defaultValue: "Трекер задач" }), path: "/tracker/dashboard" };
    const university: NavItem = { icon: GraduationCap, label: t("nav.university", { defaultValue: "Университет" }), path: "/university" };
    const ragDocs: NavItem = { icon: BookText, label: t("nav.ragDocuments", { defaultValue: "База знаний" }), path: "/rag-documents" };
    const branding: NavItem = { icon: Palette, label: t("nav.companyBranding", { defaultValue: "Фирменный стиль" }), path: "/company-branding" };
    const aiSettings: NavItem = { icon: Brain, label: t("nav.aiSettings", { defaultValue: "AI-провайдер" }), path: "/ai-settings" };
    const settings: NavItem = { icon: Settings, label: t("nav.settings"), path: "/settings" };

    if (role === "superadmin") {
      return [
        { key: "communication", label: S("communication"), entries: [
          { icon: LifeBuoy, label: t("nav.support"), path: "/support" },
          { icon: Mail, label: t("nav.emailService"), path: "/email-settings" },
        ]},
        { key: "analytics", label: S("analytics"), entries: [
          dashboard,
          { icon: Activity, label: t("nav.productAnalytics"), path: "/product-analytics" },
        ]},
        { key: "hr", label: S("hr"), entries: [
          { icon: Shield, label: t("nav.companies"), path: "/companies" },
          { icon: UserCog, label: t("nav.users"), path: "/users" },
          { icon: Banknote, label: t("nav.pricingInquiries"), path: "/pricing-inquiries" },
        ]},
        { key: "knowledge", label: S("knowledge"), entries: [university, ragDocs, tracker] },
        { key: "system", label: S("system"), entries: [branding, aiSettings, settings] },
      ];
    }

    if (role === "company_admin") {
      return [
        { key: "communication", label: S("communication"), entries: [
          { icon: MessageCircle, label: t("nav.chats", { defaultValue: "Сообщения" }), path: "/chats" },
          { icon: LifeBuoy, label: t("nav.support"), path: "/support" },
          { icon: Mail, label: t("nav.invitations"), path: "/invitations" },
        ]},
        { key: "analytics", label: S("analytics"), entries: [
          dashboard,
          { icon: BarChart3, label: t("nav.analytics"), path: "/analytics" },
        ]},
        { key: "hr", label: S("hr"), entries: [
          { icon: Rocket, label: t("nav.onboarding"), path: "/onboarding" },
          { icon: UserCog, label: t("nav.users"), path: "/users" },
          { icon: Users, label: t("nav.employees"), path: "/employees" },
          { icon: Briefcase, label: t("nav.positions"), path: "/positions" },
          tracker,
        ]},
        { key: "knowledge", label: S("knowledge"), entries: [university, ragDocs] },
        { key: "system", label: S("system"), entries: [branding, aiSettings, settings] },
      ];
    }

    if (role === "hrd") {
      return [
        { key: "communication", label: S("communication"), entries: [
          { icon: MessageCircle, label: t("nav.chats", { defaultValue: "Сообщения" }), path: "/chats" },
          { icon: Heart, label: t("nav.recognitionFeed"), path: "/recognition" },
          { icon: Mail, label: t("nav.invitations"), path: "/invitations" },
        ]},
        { key: "analytics", label: S("analytics"), entries: [
          dashboard,
          { icon: BarChart3, label: t("nav.analyticsOverview"), path: "/analytics" },
          { icon: Activity, label: t("nav.riskAnalytics"), path: "/risk-analytics" },
          {
            icon: ClipboardList,
            label: t("nav.assessmentGroup"),
            children: [
              { icon: FileJson, label: t("nav.scenarios"), path: "/scenarios" },
              { icon: ClipboardList, label: t("nav.tests"), path: "/tests" },
              { icon: ClipboardList, label: t("nav.careerReviews"), path: "/career-reviews" },
            ],
          },
        ]},
        { key: "hr", label: S("hr"), entries: [
          {
            icon: Users,
            label: t("nav.employeesGroup"),
            children: [
              { icon: Users, label: t("nav.employeesList"), path: "/employees" },
              { icon: UserCog, label: t("nav.users"), path: "/users" },
              { icon: Rocket, label: t("nav.onboarding"), path: "/onboarding" },
            ],
          },
          {
            icon: Route,
            label: t("nav.careerGroup"),
            children: [
              { icon: Briefcase, label: t("nav.positions"), path: "/positions" },
              { icon: Route, label: t("nav.careerTracksMgmt"), path: "/career-tracks-mgmt" },
            ],
          },
          {
            icon: Star,
            label: t("performance:title", { defaultValue: "Performance" }),
            children: [
              { icon: Star, label: t("performance:title", { defaultValue: "Performance Reviews" }), path: "/performance" },
              { icon: TimerReset, label: t("performance:probation.title", { defaultValue: "Испытательный срок" }), path: "/probation" },
              { icon: AlertOctagon, label: t("performance:disciplinary.title", { defaultValue: "Дисциплинарные" }), path: "/disciplinary" },
            ],
          },
          { icon: CalendarDays, label: t("leaves:title", { defaultValue: "Отсутствия" }), path: "/leaves" },
          { icon: Shield, label: t("nav.hrPolicies"), path: "/hr-policies" },
        ]},
        { key: "motivation", label: S("motivation"), entries: [
          { icon: Trophy, label: t("nav.gamification"), path: "/gamification" },
          { icon: Store, label: t("nav.shopAdmin"), path: "/shop-admin" },
        ]},
        { key: "knowledge", label: S("knowledge"), entries: [university, ragDocs, tracker] },
        { key: "system", label: S("system"), entries: [branding, aiSettings, settings] },
      ];
    }

    if (role === "manager") {
      return [
        { key: "communication", label: S("communication"), entries: [
          { icon: MessageCircle, label: t("nav.chats", { defaultValue: "Сообщения" }), path: "/chats" },
        ]},
        { key: "analytics", label: S("analytics"), entries: [
          dashboard,
          { icon: ClipboardList, label: t("nav.careerReviews"), path: "/career-reviews" },
        ]},
        { key: "hr", label: S("hr"), entries: [
          { icon: Users, label: t("nav.myTeam"), path: "/team" },
          { icon: CalendarDays, label: t("leaves:title", { defaultValue: "Отсутствия" }), path: "/leaves" },
          { icon: Star, label: t("performance:title", { defaultValue: "Performance" }), path: "/performance" },
          { icon: TimerReset, label: t("performance:probation.title", { defaultValue: "Испытательный" }), path: "/probation" },
          { icon: AlertOctagon, label: t("performance:disciplinary.title", { defaultValue: "PIP / Взыскания" }), path: "/disciplinary" },
        ]},
        { key: "knowledge", label: S("knowledge"), entries: [university, tracker] },
        { key: "system", label: S("system"), entries: [settings] },
      ];
    }

    // Employee
    return [
      { key: "communication", label: S("communication"), entries: [
        { icon: MessageCircle, label: t("nav.chats", { defaultValue: "Сообщения" }), path: "/chats" },
        { icon: Heart, label: t("nav.recognition"), path: "/recognition" },
        { icon: Bell, label: t("nav.notifications"), path: "/notifications" },
      ]},
      { key: "analytics", label: S("analytics"), entries: [dashboard] },
      { key: "hr", label: S("hr"), entries: [
        { icon: CalendarDays, label: t("leaves:title", { defaultValue: "Отсутствия" }), path: "/leaves" },
        { icon: Star, label: t("performance:title", { defaultValue: "Performance" }), path: "/performance" },
        { icon: TimerReset, label: t("performance:probation.title", { defaultValue: "Испытательный" }), path: "/probation" },
      ]},
      { key: "motivation", label: S("motivation"), entries: [
        { icon: MessageSquare, label: t("nav.aiAssessment"), path: "/assessment" },
        { icon: ClipboardCheck, label: t("nav.questionnaire"), path: "/employee-questionnaire" },
        { icon: Target, label: t("nav.careerTrack"), path: "/career-track" },
        { icon: ShoppingBag, label: t("nav.shop"), path: "/shop" },
      ]},
      { key: "knowledge", label: S("knowledge"), entries: [
        { icon: User, label: t("nav.passport"), path: "/passport" },
        university,
        tracker,
      ]},
      { key: "system", label: S("system"), entries: [settings] },
    ];
  };

  const sections = getSections().filter((s) => s.entries.length > 0);

  // initially open groups whose child path is active
  const initialOpen: Record<string, boolean> = {};
  sections.forEach((s) =>
    s.entries.forEach((e) => {
      if (isGroup(e) && e.children.some((c) => c.path === location.pathname)) {
        initialOpen[e.label] = true;
      }
    })
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);
  const toggleGroup = (label: string) =>
    setOpenGroups((p) => ({ ...p, [label]: !p[label] }));

  const roleLabels: Record<string, string> = {
    employee: t("roles.employee"),
    manager: t("roles.manager"),
    hrd: t("roles.hrd"),
    company_admin: t("roles.company_admin"),
    superadmin: t("roles.superadmin"),
  };

  const renderEntry = (entry: NavEntry) => {
    if (isGroup(entry)) {
      const hasActive = entry.children.some((c) => c.path === location.pathname);
      const isOpen = collapsed ? false : (openGroups[entry.label] ?? hasActive);
      return (
        <div key={"group:" + entry.label}>
          <button
            onClick={() => {
              if (collapsed) {
                navigate(entry.children[0].path);
                if (isMobile) onHide?.();
              } else {
                toggleGroup(entry.label);
              }
            }}
            title={collapsed ? entry.label : undefined}
            className={`relative w-full flex items-center gap-3 pl-3 pr-2 py-2 rounded-md text-sm font-medium transition-colors ${
              hasActive
                ? "text-sidebar-primary-foreground bg-sidebar-primary/10"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-primary-foreground"
            } ${collapsed ? "justify-center" : ""}`}
          >
            {hasActive && !collapsed && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-sidebar-primary" />
            )}
            <entry.icon className="w-[18px] h-[18px] flex-shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">{entry.label}</span>
                <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </>
            )}
          </button>
          {!collapsed && isOpen && (
            <div className="mt-0.5 ml-[26px] space-y-0.5">
              {entry.children.map((child) => {
                const childActive = location.pathname === child.path;
                return (
                  <button
                    key={child.path + child.label}
                    onClick={() => {
                      navigate(child.path);
                      if (isMobile) onHide?.();
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                      childActive
                        ? "text-sidebar-primary-foreground bg-sidebar-primary/15"
                        : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-primary-foreground"
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
        className={`relative w-full flex items-center gap-3 pl-3 pr-2 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? "text-sidebar-primary-foreground bg-sidebar-primary/10"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-primary-foreground"
        } ${collapsed ? "justify-center" : ""}`}
      >
        {isActive && !collapsed && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-sidebar-primary" />
        )}
        <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
        {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
        {item.badge ? (
          <span className={`${collapsed ? "absolute top-1 right-1" : ""} min-w-[18px] h-[18px] px-1 rounded-full bg-destructive/90 text-destructive-foreground text-[10px] font-semibold flex items-center justify-center`}>
            {item.badge}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 z-50 ${
        collapsed ? "w-[64px]" : "w-[240px]"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border">
        <img
          src={activeLogoUrl || brandLogo}
          alt={t("brand.logoAlt")}
          width={28}
          height={28}
          className="w-7 h-7 flex-shrink-0 object-contain"
        />
        {!collapsed && (
          <div className="leading-tight min-w-0">
            <span className="block font-bold text-sm tracking-tight truncate">{t("brand.name")}</span>
            <span className="block text-[9px] font-medium tracking-[0.18em] text-sidebar-foreground/45 uppercase">Growth Peak</span>
          </div>
        )}
      </div>

      {/* Role + profile compact */}
      {!collapsed && (
        <div className="mx-3 mt-3 px-2.5 py-1.5 rounded-md bg-sidebar-accent/40">
          <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground/45">{roleLabels[role]}</p>
          {profile && (
            <p className="text-[12px] font-medium text-sidebar-foreground truncate">{profile.full_name}</p>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-2 px-2 overflow-y-auto">
        {sections.map((section, idx) => (
          <div key={section.key} className={idx === 0 ? "" : "mt-1"}>
            {collapsed ? (
              idx > 0 && <div className="mx-2 my-2 h-px bg-sidebar-border/60" />
            ) : (
              <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/40">
                {section.label}
              </div>
            )}
            <div className="space-y-0.5">
              {section.entries.map((e) => renderEntry(e))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: sign out */}
      <div className="p-2 border-t border-sidebar-border">
        <button
          onClick={() => { signOut(); navigate("/login"); }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-primary-foreground transition-colors ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
          {!collapsed && <span>{t("actions.signOut")}</span>}
        </button>
      </div>

      {/* Sidebar controls */}
      {isMobile ? (
        <button
          onClick={onHide}
          className="absolute right-3 top-3 w-9 h-9 rounded-md bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground transition-colors flex items-center justify-center"
          aria-label={t("layout.hideMenu")}
        >
          <X className="w-5 h-5" />
        </button>
      ) : (
        <button
          onClick={onToggle}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border shadow-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label={collapsed ? t("layout.expandMenu") : t("layout.collapseMenu")}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      )}
    </aside>
  );
};

export default AppSidebar;
