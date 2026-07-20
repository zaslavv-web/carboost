import { NavLink, useLocation } from "react-router-dom";
import { ArrowLeftRight, Bell } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { writeHrdUiMode } from "@/lib/hrdUiMode";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { STUDIOS, STUDIO_MATCH, TODAY_ENTRY, type StudioKey } from "@/lib/hrdStudios";

/**
 * Компактный 56px рейл. Сверху отдельно «Today» (домашний экран ежедневной работы),
 * ниже разделитель и 5 студий глубокой работы.
 */
const StudioRail = () => {
  const { pathname } = useLocation();
  const unread = useUnreadNotifications();

  const switchToClassic = () => {
    writeHrdUiMode("classic");
    window.location.href = "/dashboard";
  };

  const todayActive = pathname === "/today";
  const TodayIcon = TODAY_ENTRY.icon;

  return (
    <TooltipProvider delayDuration={100}>
      <aside className="w-14 shrink-0 border-r border-border/60 bg-card/40 flex flex-col items-center py-3 gap-1">
        {/* Home — визуально отделена от студий */}
        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink
              to={TODAY_ENTRY.to}
              className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center transition-colors",
                todayActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary",
              )}
              aria-label={TODAY_ENTRY.label}
            >
              <TodayIcon className="w-5 h-5" />
            </NavLink>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>{TODAY_ENTRY.label}</TooltipContent>
        </Tooltip>

        <div className="h-px w-6 bg-border/60 my-2" />

        {STUDIOS.map((s) => {
          const active = STUDIO_MATCH[s.key as StudioKey].test(pathname);
          return (
            <Tooltip key={s.key}>
              <TooltipTrigger asChild>
                <NavLink
                  to={s.to}
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                  )}
                  aria-label={s.label}
                >
                  <s.icon className="w-[18px] h-[18px]" />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>{s.label}</TooltipContent>
            </Tooltip>
          );
        })}

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink
              to="/notifications"
              className="relative w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Уведомления"
            >
              <Bell className="w-[18px] h-[18px]" />
              {unread > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
              )}
            </NavLink>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>Уведомления</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={switchToClassic}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Классический режим"
            >
              <ArrowLeftRight className="w-[18px] h-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>Классический режим</TooltipContent>
        </Tooltip>
      </aside>
    </TooltipProvider>
  );
};

export default StudioRail;
