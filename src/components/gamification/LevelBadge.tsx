import { Sparkles, Rocket, Star, Trophy, Crown, Award, Medal, Flame } from "lucide-react";
import type { GamificationLevel } from "@/hooks/useEmployeeLevel";

const ICONS: Record<string, any> = {
  sparkles: Sparkles, rocket: Rocket, star: Star, trophy: Trophy,
  crown: Crown, award: Award, medal: Medal, flame: Flame,
};

interface Props {
  level: Pick<GamificationLevel, "title" | "icon" | "color" | "order">;
  size?: "sm" | "md" | "lg";
  showTitle?: boolean;
  className?: string;
}

export const LevelBadge = ({ level, size = "md", showTitle = true, className = "" }: Props) => {
  const Icon = ICONS[level.icon] || Star;
  const dims = size === "sm" ? "h-5 w-5 text-[10px]" : size === "lg" ? "h-9 w-9 text-sm" : "h-7 w-7 text-xs";
  const iconSize = size === "sm" ? "w-3 h-3" : size === "lg" ? "w-5 h-5" : "w-4 h-4";

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`${dims} inline-flex items-center justify-center rounded-full text-white shadow-sm`}
        style={{ backgroundColor: level.color }}
        title={`Уровень ${level.order}: ${level.title}`}
      >
        <Icon className={iconSize} />
      </span>
      {showTitle && (
        <span className="text-xs font-medium text-foreground">
          {level.title}
          <span className="text-muted-foreground"> · ур. {level.order}</span>
        </span>
      )}
    </div>
  );
};
