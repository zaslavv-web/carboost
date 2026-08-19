import {
  Sparkles,
  Target,
  Trophy,
  BarChart3,
  Users,
  ShoppingBag,
  FileSearch,
  LineChart,
  CalendarDays,
  Award,
  GraduationCap,
  BookOpen,
  MessagesSquare,
  Brain,
  GitBranch,
  Network,
  Layers,
  Gauge,
  KanbanSquare,
  TrendingUp,
  FileSignature,
  Plug,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

/**
 * Feature metadata — all displayable text lives in i18n landing.json under
 * "featureData.<slug>". This file only carries slugs, icons, categories and
 * story relationships, so adding a feature = adding entry here + entry in
 * locales/{lang}/landing.json.
 */
export type FeatureSlug =
  | "ai-assessment"
  | "career-tracks"
  | "gamification"
  | "analytics"
  | "digital-passport"
  | "onboarding"
  | "performance"
  | "leaves"
  | "recognition"
  | "university"
  | "shop"
  | "hr-policies"
  | "internal-chat"
  | "rag-ai"
  | "scenarios"
  | "org-structure"
  | "talent-review"
  | "pulse-surveys"
  | "tracker"
  | "predictive"
  | "kedo"
  | "integrations-1c"
  | "security-sso";

export type ModuleCategory = "growth" | "culture" | "ops" | "data" | "enterprise";

export interface FeatureMeta {
  slug: FeatureSlug;
  icon: LucideIcon;
  category: ModuleCategory;
}

export const FEATURES: FeatureMeta[] = [
  // Growth & careers
  { slug: "career-tracks", icon: Target, category: "growth" },
  { slug: "university", icon: GraduationCap, category: "growth" },
  { slug: "ai-assessment", icon: Sparkles, category: "growth" },
  { slug: "performance", icon: LineChart, category: "growth" },
  { slug: "talent-review", icon: Layers, category: "growth" },
  // People & culture
  { slug: "digital-passport", icon: Users, category: "culture" },
  { slug: "recognition", icon: Award, category: "culture" },
  { slug: "gamification", icon: Trophy, category: "culture" },
  { slug: "shop", icon: ShoppingBag, category: "culture" },
  { slug: "pulse-surveys", icon: Gauge, category: "culture" },
  // HR operations
  { slug: "onboarding", icon: FileSearch, category: "ops" },
  { slug: "leaves", icon: CalendarDays, category: "ops" },
  { slug: "hr-policies", icon: BookOpen, category: "ops" },
  { slug: "org-structure", icon: Network, category: "ops" },
  { slug: "tracker", icon: KanbanSquare, category: "ops" },
  // Data & AI
  { slug: "analytics", icon: BarChart3, category: "data" },
  { slug: "rag-ai", icon: Brain, category: "data" },
  { slug: "scenarios", icon: GitBranch, category: "data" },
  { slug: "internal-chat", icon: MessagesSquare, category: "data" },
  { slug: "predictive", icon: TrendingUp, category: "data" },
  // Enterprise & integrations
  { slug: "kedo", icon: FileSignature, category: "enterprise" },
  { slug: "integrations-1c", icon: Plug, category: "enterprise" },
  { slug: "security-sso", icon: ShieldCheck, category: "enterprise" },
];

export const MODULE_CATEGORIES: { key: ModuleCategory; slugs: FeatureSlug[] }[] = [
  { key: "growth", slugs: ["career-tracks", "university", "ai-assessment", "performance", "talent-review"] },
  { key: "culture", slugs: ["digital-passport", "recognition", "gamification", "shop", "pulse-surveys"] },
  { key: "ops", slugs: ["onboarding", "leaves", "hr-policies", "org-structure", "tracker"] },
  { key: "data", slugs: ["analytics", "rag-ai", "scenarios", "internal-chat", "predictive"] },
  { key: "enterprise", slugs: ["kedo", "integrations-1c", "security-sso"] },
];

export const featureBySlug = (slug: FeatureSlug): FeatureMeta =>
  FEATURES.find((f) => f.slug === slug)!;

// Re-export icon for shop-related callers if any.
export { ShoppingBag };

export type RoleStoryKey = "hrd" | "manager" | "lead" | "employee" | "admin";
export const ROLE_STORY_KEYS: { key: RoleStoryKey; features: FeatureSlug[] }[] = [
  { key: "hrd", features: ["analytics", "predictive", "talent-review"] },
  { key: "manager", features: ["onboarding", "ai-assessment", "performance"] },
  { key: "lead", features: ["career-tracks", "digital-passport", "performance"] },
  { key: "employee", features: ["digital-passport", "career-tracks", "shop"] },
  { key: "admin", features: ["security-sso", "integrations-1c", "kedo"] },
];

export type PainKey =
  | "retain"
  | "assess"
  | "grow"
  | "motivate"
  | "onboard"
  | "decide"
  | "vacation"
  | "performance"
  | "knowledge"
  | "recognition"
  | "learning";
export const PAIN_KEYS: PainKey[] = [
  "retain",
  "assess",
  "grow",
  "performance",
  "vacation",
  "learning",
  "knowledge",
  "recognition",
  "motivate",
  "onboard",
  "decide",
];
