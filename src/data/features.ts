import { Sparkles, Target, Trophy, BarChart3, Users, ShoppingBag, FileSearch, type LucideIcon } from "lucide-react";

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
  | "onboarding";

export interface FeatureMeta {
  slug: FeatureSlug;
  icon: LucideIcon;
}

export const FEATURES: FeatureMeta[] = [
  { slug: "ai-assessment", icon: Sparkles },
  { slug: "career-tracks", icon: Target },
  { slug: "gamification", icon: Trophy },
  { slug: "analytics", icon: BarChart3 },
  { slug: "digital-passport", icon: Users },
  { slug: "onboarding", icon: FileSearch },
];

// Re-export icon for shop-related callers if any.
export { ShoppingBag };

export type RoleStoryKey = "hrd" | "manager" | "lead";
export const ROLE_STORY_KEYS: { key: RoleStoryKey; features: FeatureSlug[] }[] = [
  { key: "hrd", features: ["analytics", "career-tracks", "digital-passport"] },
  { key: "manager", features: ["onboarding", "ai-assessment", "gamification"] },
  { key: "lead", features: ["career-tracks", "digital-passport", "analytics"] },
];

export type PainKey = "retain" | "assess" | "grow" | "motivate" | "onboard" | "decide";
export const PAIN_KEYS: PainKey[] = ["retain", "assess", "grow", "motivate", "onboard", "decide"];
