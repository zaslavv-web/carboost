import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePrimaryRole, useUserProfile } from "@/hooks/useUserProfile";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  LayoutDashboard, MessageCircle, User, Target, Settings, LogOut,
  ChevronLeft, ChevronRight, ChevronDown, X, Briefcase, Users, Shield,
  LifeBuoy, FileJson, BarChart3, UserCog, Route, Trophy, ClipboardList,
  ShoppingBag, Store, Rocket, Mail, Heart, Activity, ClipboardCheck,
  Banknote, CalendarDays, Star, AlertOctagon, TimerReset, Palette, Brain,
  BookText, GraduationCap, Crosshair, BookOpen, Sparkles, Newspaper, Webhook,
} from "lucide-react";
import brandLogo from "@/assets/logo-growth-peak.png";
import { useBranding } from "@/contexts/BrandingContext";

interface NavItem { icon: any; label: string; path: string; badge?: number; }
interface NavGroup { icon: any; label: string; children: NavItem[]; }
type NavEntry = NavItem | NavGroup;
interface NavSection { key: string; label: string; entries: NavEntry[]; }

const isGroup = (e: NavEntry): e is NavGroup => "children" in e;

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onHide?: () => void;
  isMobile?: boolean;
}

/* -------- Design tokens (единая сетка отступов) --------
   Все три уровня выравнены по одной колонке текста:
   pl-3 (12) + icon-slot 18 + gap 10 ≈ 40px до текста.
   Дочерние пункты внутри группы получают тонкую левую линию
   и небольшой pl, чтобы иерархия читалась без сдвига колонки.
*/
const ROW_BASE =
  "relative w-full flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-md text-sm transition-colors";
const ROW_ACTIVE =
  "text-sidebar-primary font-semibold bg-sidebar-primary/10";
const ROW_IDLE =
  "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

const AppSidebar = ({ collapsed, onToggle, onHide, isMobile }: AppSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const role = usePrimaryRole();
  const { data: profile } = useUserProfile();
  const { t } = useTranslation();
  const { activeLogoUrl } = useBranding();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const getSections = (): NavSection[] => {
    const S = (key: string) => t(`nav.sections.${key}`);
    const dashboard: NavItem = { icon: LayoutDashboard, label: t("nav.dashboard"), path: "/dashboard" };
    const tracker: NavItem = { icon: Crosshair, label: t("nav.tracker", { defaultValue: "Трекер задач" }), path: "/tracker/dashboard" };
    const myProfile: NavItem = { icon: User, label: t("nav.myProfile", { defaultValue: "Мой профиль" }), path: "/me" };
    const university: NavItem = { icon: GraduationCap, label: t("nav.university", { defaultValue: "Университет" }), path: "/university" };
    const knowledgeBase: NavItem = { icon: BookText, label: t("nav.knowledgeBase", { defaultValue: "База знаний" }), path: "/rag-documents" };
    const branding: NavItem = { icon: Palette, label: t("nav.companyBranding", { defaultValue: "Фирменный стиль" }), path: "/company-branding" };
    const aiSettings: NavItem = { icon: Brain, label: t("nav.aiSettings", { defaultValue: "AI-провайдер" }), path: "/ai-settings" };
    const settings: NavItem = { icon: Settings, label: t("nav.settings"), path: "/settings" };
    const integrations: NavItem = { icon: Webhook, label: "Интеграции", path: "/integrations" };
    const chats: NavItem = { icon: MessageCircle, label: t("nav.chats", { defaultValue: "Сообщения" }), path: "/chats" };
    const feed: NavItem = { icon: Newspaper, label: t("nav.feed", { defaultValue: "Лента компании" }), path: "/feed" };
    const communities: NavItem = { icon: Users, label: t("nav.communities", { defaultValue: "Сообщества" }), path: "/communities" };
    const pulse: NavItem = { icon: Activity, label: t("nav.pulseSurveys", { defaultValue: "Pulse-опросы" }), path: "/pulse-surveys" };
    const leaves: NavItem = { icon: CalendarDays, label: t("leaves:title", { defaultValue: "Отсутствия" }), path: "/leaves" };
    const performance: NavItem = { icon: Star, label: t("performance:title", { defaultValue: "Performance" }), path: "/performance" };

    if (role === "superadmin") {
      return [
        { key: "myWork", label: S("myWork"), entries: [myProfile, tracker] },
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
        { key: "knowledge", label: S("knowledge"), entries: [university, knowledgeBase] },
        { key: "system", label: S("system"), entries: [branding, aiSettings, integrations, settings] },
      ];
    }

    if (role === "company_admin") {
      return [
        { key: "myWork", label: S("myWork"), entries: [myProfile, tracker] },
        { key: "communication", label: S("communication"), entries: [chats, feed, communities, { icon: LifeBuoy, label: t("nav.support"), path: "/support" }] },
        { key: "analytics", label: S("analytics"), entries: [
          dashboard,
          { icon: BarChart3, label: t("nav.analytics"), path: "/analytics" },
          pulse,
        ]},
        { key: "hr", label: S("hr"), entries: [
          { icon: Rocket, label: t("nav.onboarding"), path: "/onboarding" },
          { icon: UserCog, label: t("nav.users"), path: "/users" },
          { icon: Users, label: t("nav.employees"), path: "/employees" },
          { icon: Briefcase, label: t("nav.positions"), path: "/positions" },
          { icon: Mail, label: t("nav.invitations"), path: "/invitations" },
        ]},
        { key: "knowledge", label: S("knowledge"), entries: [
          university,
          { icon: BookOpen, label: t("nav.knowledgeBase", { defaultValue: "База знаний" }), path: "/knowledge-base" },
          { icon: Target, label: t("nav.idp", { defaultValue: "Планы развития (ИПР)" }), path: "/idp" },
        ] },
        { key: "system", label: S("system"), entries: [branding, aiSettings, integrations, settings] },
      ];
    }

    if (role === "hrd") {
      return [
        { key: "myWork", label: S("myWork"), entries: [myProfile, tracker] },
        { key: "communication", label: S("communication"), entries: [chats, feed, communities, { icon: Heart, label: t("nav.recognitionFeed"), path: "/recognition" }] },
        { key: "analytics", label: S("analytics"), entries: [
          dashboard,
          { icon: BarChart3, label: "People Analytics", path: "/people-analytics" },
          { icon: Activity, label: t("nav.riskAnalytics"), path: "/risk-analytics" },
          pulse,
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
              { icon: Rocket, label: t("nav.onboarding"), path: "/onboarding" },
              { icon: Rocket, label: t("nav.adaptationPlans", { defaultValue: "Планы адаптации" }), path: "/adaptation-plans" },
              { icon: Mail, label: t("nav.invitations"), path: "/invitations" },
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
            label: t("nav.performance", { defaultValue: "Performance" }),
            children: [
              performance,
              { icon: Users, label: t("nav.perf360", { defaultValue: "360° ревью" }), path: "/performance-360" },
              { icon: Sparkles, label: t("nav.skillsMatrix", { defaultValue: "Матрица компетенций" }), path: "/skills-matrix" },
              { icon: TimerReset, label: t("performance:probation.title", { defaultValue: "Испытательный срок" }), path: "/probation" },
              { icon: AlertOctagon, label: t("performance:disciplinary.title", { defaultValue: "Дисциплинарные" }), path: "/disciplinary" },
            ],
          },
          {
            icon: FileJson,
            label: "Документы и политики",
            children: [
              { icon: FileJson, label: "HR-документы", path: "/hr-documents-personal" },
              { icon: Shield, label: t("nav.hrPolicies"), path: "/hr-policies" },
            ],
          },
          leaves,
        ]},
        { key: "motivation", label: S("motivation"), entries: [
          { icon: Trophy, label: t("nav.gamification"), path: "/gamification" },
          { icon: Store, label: t("nav.shopAdmin"), path: "/shop-admin" },
        ]},
        { key: "knowledge", label: S("knowledge"), entries: [university, knowledgeBase] },
        { key: "system", label: S("system"), entries: [branding, aiSettings, integrations, settings] },
      ];
    }

    if (role === "manager") {
      return [
        { key: "myWork", label: S("myWork"), entries: [myProfile, tracker] },
        { key: "communication", label: S("communication"), entries: [chats, feed, communities] },
        { key: "analytics", label: S("analytics"), entries: [
          dashboard,
          { icon: ClipboardList, label: t("nav.careerReviews"), path: "/career-reviews" },
          pulse,
        ]},
        { key: "hr", label: S("hr"), entries: [
          { icon: Users, label: t("nav.myTeam"), path: "/team" },
          { icon: Mail, label: t("nav.invitations"), path: "/invitations" },
          leaves,
          { icon: FileJson, label: "HR-документы", path: "/hr-documents-personal" },
          {
            icon: Star,
            label: t("nav.performance", { defaultValue: "Performance" }),
            children: [
              performance,
              { icon: TimerReset, label: t("performance:probation.title", { defaultValue: "Испытательный" }), path: "/probation" },
              { icon: AlertOctagon, label: t("performance:disciplinary.title", { defaultValue: "PIP / Взыскания" }), path: "/disciplinary" },
            ],
          },
        ]},
        { key: "knowledge", label: S("knowledge"), entries: [university] },
        { key: "system", label: S("system"), entries: [settings] },
      ];
    }

    // Employee
    return [
      { key: "myWork", label: S("myWork"), entries: [
        myProfile,
        tracker,
        { icon: Target, label: t("nav.careerTrack"), path: "/career-track" },
      ]},
      { key: "communication", label: S("communication"), entries: [chats, feed, communities, pulse] },
      { key: "analytics", label: S("analytics"), entries: [dashboard] },
      { key: "hr", label: S("hr"), entries: [
        leaves,
        { icon: FileJson, label: "Мои HR-документы", path: "/hr-documents-personal" },
        performance,
      ]},
      { key: "motivation", label: S("motivation"), entries: [
        { icon: Heart, label: t("nav.recognition"), path: "/recognition" },
        { icon: ShoppingBag, label: t("nav.shop"), path: "/shop" },
        { icon: ClipboardCheck, label: t("nav.questionnaire"), path: "/employee-questionnaire" },
      ]},
      { key: "knowledge", label: S("knowledge"), entries: [
        { icon: User, label: t("nav.passport"), path: "/passport" },
        university,
      ]},
      { key: "system", label: S("system"), entries: [settings] },
    ];
  };

  const sections = getSections().filter((s) => s.entries.length > 0);

  const sectionIconMap: Record<string, any> = {
    myWork: Briefcase, communication: MessageCircle, analytics: BarChart3,
    hr: Users, motivation: Trophy, knowledge: GraduationCap, system: Settings,
  };

  const entryContainsActive = (e: NavEntry): boolean =>
    isGroup(e) ? e.children.some((c) => c.path === location.pathname) : e.path === location.pathname;
  const sectionContainsActive = (s: NavSection) => s.entries.some(entryContainsActive);

  const initialOpen: Record<string, boolean> = {};
  sections.forEach((s) =>
    s.entries.forEach((e) => {
      if (isGroup(e) && e.children.some((c) => c.path === location.pathname)) {
        initialOpen[e.label] = true;
      }
    })
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);
  const toggleGroup = (label: string) => setOpenGroups((p) => ({ ...p, [label]: !p[label] }));

  const SECTION_STORAGE_KEY = "sidebar.openSections.v2";
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(SECTION_STORAGE_KEY) : null;
      if (raw) return JSON.parse(raw);
    } catch {}
    const init: Record<string, boolean> = {};
    sections.forEach((s) => { if (sectionContainsActive(s)) init[s.key] = true; });
    return init;
  });
  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev };
      sections.forEach((s) => { if (sectionContainsActive(s)) next[s.key] = true; });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  useEffect(() => {
    try { window.localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(openSections)); } catch {}
  }, [openSections]);
  const toggleSection = (key: string) => setOpenSections((p) => ({ ...p, [key]: !p[key] }));

  const [flyoutKey, setFlyoutKey] = useState<string | null>(null);
  const [flyoutTop, setFlyoutTop] = useState<number>(0);
  const flyoutTimer = useRef<number | null>(null);
  const openFlyout = (key: string, el: HTMLElement) => {
    if (flyoutTimer.current) { window.clearTimeout(flyoutTimer.current); flyoutTimer.current = null; }
    setFlyoutTop(el.getBoundingClientRect().top);
    setFlyoutKey(key);
  };
  const scheduleCloseFlyout = () => {
    if (flyoutTimer.current) window.clearTimeout(flyoutTimer.current);
    flyoutTimer.current = window.setTimeout(() => setFlyoutKey(null), 140);
  };
  const cancelCloseFlyout = () => {
    if (flyoutTimer.current) { window.clearTimeout(flyoutTimer.current); flyoutTimer.current = null; }
  };

  const roleLabels: Record<string, string> = {
    employee: t("roles.employee"),
    manager: t("roles.manager"),
    hrd: t("roles.hrd"),
    company_admin: t("roles.company_admin"),
    superadmin: t("roles.superadmin"),
  };

  const renderEntry = (entry: NavEntry, sectionKey: string, forceExpanded = false) => {
    const isCompact = collapsed && !forceExpanded;
    if (isGroup(entry)) {
      const hasActive = entry.children.some((c) => c.path === location.pathname);
      const isOpen = isCompact ? false : (hasActive || !!openGroups[entry.label]);
      return (
        <div key={`group:${sectionKey}:${entry.label}`}>
          <button
            onClick={() => {
              if (isCompact) {
                navigate(entry.children[0].path);
                if (isMobile) onHide?.();
              } else {
                toggleGroup(entry.label);
              }
            }}
            title={isCompact ? entry.label : undefined}
            className={`${ROW_BASE} ${hasActive ? ROW_ACTIVE : ROW_IDLE} ${isCompact ? "justify-center" : ""}`}
          >
            {hasActive && !isCompact && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-sidebar-primary" />
            )}
            <entry.icon className="w-[18px] h-[18px] flex-shrink-0" />
            {!isCompact && (
              <>
                <span className="flex-1 text-left truncate">{entry.label}</span>
                <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </>
            )}
          </button>
          {!isCompact && isOpen && (
            <div className="mt-1 ml-5 pl-3 border-l border-sidebar-border/40 space-y-0.5">
              {entry.children.map((child) => {
                const childActive = location.pathname === child.path;
                return (
                  <button
                    key={`child:${sectionKey}:${child.path}`}
                    onClick={() => { navigate(child.path); if (isMobile) onHide?.(); }}
                    className={`w-full flex items-center gap-2.5 pl-2 pr-2 py-1.5 rounded-md text-[13px] transition-colors ${
                      childActive
                        ? "text-sidebar-primary font-semibold bg-sidebar-primary/15"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <child.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate text-left">{child.label}</span>
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
        key={`item:${sectionKey}:${item.path}`}
        onClick={() => { navigate(item.path); if (isMobile) onHide?.(); }}
        title={isCompact ? item.label : undefined}
        className={`${ROW_BASE} ${isActive ? ROW_ACTIVE : ROW_IDLE} ${isCompact ? "justify-center" : ""}`}
      >
        {isActive && !isCompact && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-sidebar-primary" />
        )}
        <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
        {!isCompact && <span className="flex-1 text-left truncate">{item.label}</span>}
        {item.badge ? (
          <span className={`${isCompact ? "absolute top-1 right-1" : ""} min-w-[18px] h-[18px] px-1 rounded-full bg-destructive/90 text-destructive-foreground text-[10px] font-semibold flex items-center justify-center`}>
            {item.badge}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-dvh bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 z-50 ${
        collapsed ? "w-[64px]" : "w-[240px]"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-sidebar-border shrink-0">
        <img
          src={activeLogoUrl || brandLogo}
          alt={t("brand.logoAlt")}
          width={26} height={26}
          className="w-[26px] h-[26px] flex-shrink-0 object-contain"
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
        <div className="mx-2 mt-2 px-2.5 py-1.5 rounded-md bg-sidebar-accent/40 shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground/45">{roleLabels[role]}</p>
          {profile && (
            <p className="text-[12px] font-medium text-sidebar-foreground truncate">{profile.full_name}</p>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-1 px-2 overflow-y-auto overflow-x-visible">
        {sections.map((section) => {
          const SectionIcon = sectionIconMap[section.key] || Settings;
          const hasActive = sectionContainsActive(section);
          const isOpen = !collapsed && (!!openSections[section.key] || hasActive);

          if (collapsed && !isMobile) {
            const isFlyoutOpen = flyoutKey === section.key;
            return (
              <div
                key={section.key}
                className="relative my-0.5"
                onMouseEnter={(e) => openFlyout(section.key, e.currentTarget)}
                onMouseLeave={scheduleCloseFlyout}
              >
                <button
                  className={`relative w-full flex items-center justify-center py-2 rounded-md transition-colors ${
                    hasActive ? "text-sidebar-primary bg-sidebar-primary/10" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                  title={section.label} aria-label={section.label}
                >
                  {hasActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-sidebar-primary" />
                  )}
                  <SectionIcon className="w-[18px] h-[18px]" />
                </button>
                {isFlyoutOpen && (
                  <div
                    className="fixed left-[64px] z-[60] w-[252px] pl-2"
                    style={{ top: Math.max(8, flyoutTop) }}
                    onMouseEnter={cancelCloseFlyout}
                    onMouseLeave={scheduleCloseFlyout}
                  >
                    <div className="rounded-lg border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl p-2">
                      <div className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45 flex items-center gap-2">
                        <SectionIcon className="w-3.5 h-3.5" />
                        <span>{section.label}</span>
                      </div>
                      <div className="space-y-0.5">
                        {section.entries.map((e) => renderEntry(e, section.key, true))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={section.key} className="mt-0.5">
              <button
                onClick={() => toggleSection(section.key)}
                className={`w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-md transition-colors ${
                  hasActive ? "text-sidebar-primary" : "text-sidebar-foreground/55 hover:text-sidebar-foreground"
                }`}
              >
                <SectionIcon className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
                <span className="flex-1 text-left text-[10px] font-semibold uppercase tracking-[0.14em]">
                  {section.label}
                </span>
                <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="space-y-0.5 mt-0.5">
                  {section.entries.map((e) => renderEntry(e, section.key))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom: sign out */}
      <div className="p-2 border-t border-sidebar-border shrink-0">
        <button
          onClick={() => setLogoutOpen(true)}
          className={`w-full flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
          {!collapsed && <span className="flex-1 text-left">{t("actions.signOut")}</span>}
        </button>
      </div>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти из системы?</AlertDialogTitle>
            <AlertDialogDescription>Вы будете перенаправлены на страницу входа.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Нет</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { await signOut(); navigate("/login"); }}>Да, выйти</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
