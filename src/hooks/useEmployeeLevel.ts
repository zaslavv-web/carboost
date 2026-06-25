/**
 * Уровни геймификации сотрудника.
 * Бэкенд `gamification_levels` пока не реализован — конфиг хранится в localStorage
 * на уровне компании (по аналогии с custom events в GamificationManagement).
 * Уровень рассчитывается локально по очкам / выслуге / числу достижений.
 */
import { useQuery } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useEffectiveUserId } from "@/hooks/useUserProfile";

export interface GamificationLevel {
  id: string;
  order: number;
  title: string;
  icon: string;            // lucide icon name
  color: string;           // hsl/hex string
  min_points: number;
  min_tenure_months: number;
  min_achievements: number;
  description?: string;
}

const DEFAULT_LEVELS: GamificationLevel[] = [
  { id: "lvl-1", order: 1, title: "Новичок",   icon: "sparkles", color: "#64748b", min_points: 0,    min_tenure_months: 0,  min_achievements: 0, description: "Знакомится с компанией" },
  { id: "lvl-2", order: 2, title: "Участник",  icon: "rocket",   color: "#0ea5e9", min_points: 50,   min_tenure_months: 3,  min_achievements: 1, description: "Вовлечён в процессы" },
  { id: "lvl-3", order: 3, title: "Профи",     icon: "star",     color: "#22c55e", min_points: 200,  min_tenure_months: 12, min_achievements: 3, description: "Самостоятельный специалист" },
  { id: "lvl-4", order: 4, title: "Эксперт",   icon: "trophy",   color: "#f59e0b", min_points: 500,  min_tenure_months: 24, min_achievements: 6, description: "Делится знаниями" },
  { id: "lvl-5", order: 5, title: "Магистр",   icon: "crown",    color: "#a855f7", min_points: 1200, min_tenure_months: 48, min_achievements: 10, description: "Носитель культуры" },
];

const storageKey = (companyId: string | null | undefined) => `gam_levels_${companyId || "global"}`;

export function readLevels(companyId: string | null | undefined): GamificationLevel[] {
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    if (!raw) return DEFAULT_LEVELS;
    const parsed = JSON.parse(raw) as GamificationLevel[];
    return [...parsed].sort((a, b) => a.order - b.order);
  } catch {
    return DEFAULT_LEVELS;
  }
}

export function writeLevels(companyId: string | null | undefined, levels: GamificationLevel[]) {
  localStorage.setItem(storageKey(companyId), JSON.stringify(levels));
}

export interface ComputedLevel {
  current: GamificationLevel;
  next: GamificationLevel | null;
  points: number;
  tenureMonths: number;
  achievementsCount: number;
  progressToNext: number;          // 0..1
  pointsToNext: number | null;     // null если уже максимум
}

export function computeLevel(
  levels: GamificationLevel[],
  points: number,
  tenureMonths: number,
  achievementsCount: number,
): ComputedLevel {
  const sorted = [...levels].sort((a, b) => a.order - b.order);
  let current = sorted[0];
  for (const l of sorted) {
    if (
      points >= l.min_points &&
      tenureMonths >= l.min_tenure_months &&
      achievementsCount >= l.min_achievements
    ) {
      current = l;
    }
  }
  const idx = sorted.findIndex((l) => l.id === current.id);
  const next = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;

  let progressToNext = 1;
  let pointsToNext: number | null = null;
  if (next) {
    const span = Math.max(1, next.min_points - current.min_points);
    progressToNext = Math.max(0, Math.min(1, (points - current.min_points) / span));
    pointsToNext = Math.max(0, next.min_points - points);
  }

  return { current, next, points, tenureMonths, achievementsCount, progressToNext, pointsToNext };
}

function monthsBetween(from: string | null | undefined, to: Date = new Date()): number {
  if (!from) return 0;
  const d = new Date(from);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, (to.getFullYear() - d.getFullYear()) * 12 + (to.getMonth() - d.getMonth()));
}

/**
 * Хук: вычисляет уровень пользователя.
 * Тянет очки из employee_rewards (sum points) + кол-во achievements.
 */
export function useEmployeeLevel(opts: { userId?: string | null; companyId?: string | null; hireDate?: string | null }) {
  const fallbackUid = useEffectiveUserId();
  const userId = opts.userId ?? fallbackUid;
  const companyId = opts.companyId ?? null;

  return useQuery({
    queryKey: ["employee_level", userId, companyId, opts.hireDate],
    enabled: !!userId,
    queryFn: async () => {
      const [rewardsRes, achievementsRes, typesRes] = await Promise.all([
        laravelDb.from("employee_rewards").select("reward_type_id").eq("user_id", userId!),
        laravelDb.from("achievements").select("id").eq("user_id", userId!),
        laravelDb.from("gamification_reward_types").select("id,points"),
      ]);
      const rewards = (rewardsRes.data as any[]) || [];
      const achievements = (achievementsRes.data as any[]) || [];
      const types = (typesRes.data as any[]) || [];
      const pointsMap = new Map<string, number>(types.map((t) => [t.id, Number(t.points) || 0]));
      const points = rewards.reduce((s, r) => s + (pointsMap.get(r.reward_type_id) ?? 0), 0);

      const levels = readLevels(companyId);
      const tenureMonths = monthsBetween(opts.hireDate ?? null);
      return computeLevel(levels, points, tenureMonths, achievements.length);
    },
  });
}

export const DEFAULT_GAMIFICATION_LEVELS = DEFAULT_LEVELS;
