import { Home, Users, BarChart3, GraduationCap, PartyPopper, Settings2, type LucideIcon } from "lucide-react";

export type StudioKey = "people" | "analytics" | "learning" | "culture" | "ops";

export type StudioEntry = {
  key: StudioKey | "today";
  to: string;
  icon: LucideIcon;
  label: string;
  short: string;
};

/** Home entry — визуально отделена от студий. */
export const TODAY_ENTRY: StudioEntry = {
  key: "today",
  to: "/today",
  icon: Home,
  label: "На главную — Today",
  short: "Today",
};

/** 5 студий глубокой работы. */
export const STUDIOS: readonly StudioEntry[] = [
  { key: "people",    to: "/users",       icon: Users,         label: "People — сотрудники, треки, паспорт", short: "People" },
  { key: "analytics", to: "/analytics",   icon: BarChart3,     label: "Analytics — риски, комфорт, продукт", short: "Analytics" },
  { key: "learning",  to: "/university",  icon: GraduationCap, label: "Learning — обучение, IDP, адаптация", short: "Learning" },
  { key: "culture",   to: "/feed",        icon: PartyPopper,   label: "Culture — признание, магазин, пульс", short: "Culture" },
  { key: "ops",       to: "/hr-policies", icon: Settings2,     label: "Ops — политики, документы, поддержка", short: "Ops" },
] as const;

export const STUDIO_MATCH: Record<StudioKey, RegExp> = {
  people:    /^\/(users|passport|skills-matrix|positions|career-tracks|idp|career-reviews|employees|team)/,
  analytics: /^\/(analytics|risk-analytics|people-analytics|product-analytics|dashboard)/,
  learning:  /^\/(university|onboarding|adaptation-plans|probation|assessment)/,
  culture:   /^\/(feed|recognition|gamification|shop|pulse-surveys|communities)/,
  ops:       /^\/(hr-policies|hr-documents|leaves|disciplinary|invitations|support|settings|ai-settings|integrations|email-settings|company-branding|rag-documents)/,
};

/** Название активной студии по URL — для крошки в шапке. `null`, если пользователь на Today. */
export const getActiveStudioLabel = (pathname: string): string | null => {
  if (pathname === "/today") return null;
  for (const s of STUDIOS) {
    if (STUDIO_MATCH[s.key as StudioKey].test(pathname)) return s.short;
  }
  return null;
};
