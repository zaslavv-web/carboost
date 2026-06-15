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
  type LucideIcon,
} from "lucide-react";

/**
 * Feature metadata — all displayable text lives in i18n landing.json under
 * "featureData.<slug>". This file only carries slugs, icons and story
 * relationships, so adding a feature = adding entry here + entry in
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
  | "org-structure";

export interface FeatureMeta {
  slug: FeatureSlug;
  icon: LucideIcon;
}

export const FEATURES: FeatureMeta[] = [
  { slug: "ai-assessment", icon: Sparkles },
  { slug: "career-tracks", icon: Target },
  { slug: "performance", icon: LineChart },
  { slug: "university", icon: GraduationCap },
  { slug: "analytics", icon: BarChart3 },
  { slug: "digital-passport", icon: Users },
  { slug: "leaves", icon: CalendarDays },
  { slug: "recognition", icon: Award },
  { slug: "gamification", icon: Trophy },
  { slug: "shop", icon: ShoppingBag },
  { slug: "onboarding", icon: FileSearch },
  { slug: "hr-policies", icon: BookOpen },
  { slug: "internal-chat", icon: MessagesSquare },
  { slug: "rag-ai", icon: Brain },
  { slug: "scenarios", icon: GitBranch },
  { slug: "org-structure", icon: Network },
];

// Re-export icon for shop-related callers if any.
export { ShoppingBag };

export type RoleStoryKey = "hrd" | "manager" | "lead" | "employee" | "admin";
export const ROLE_STORY_KEYS: { key: RoleStoryKey; features: FeatureSlug[] }[] = [
  { key: "hrd", features: ["analytics", "career-tracks", "digital-passport"] },
  { key: "manager", features: ["onboarding", "ai-assessment", "performance"] },
  { key: "lead", features: ["career-tracks", "digital-passport", "performance"] },
  { key: "employee", features: ["digital-passport", "career-tracks", "shop"] },
  { key: "admin", features: ["org-structure", "hr-policies", "internal-chat"] },
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
