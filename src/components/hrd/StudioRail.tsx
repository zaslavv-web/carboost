import { NavLink, useLocation } from "react-router-dom";
import { Home, Users, BarChart3, GraduationCap, PartyPopper, Settings2, ArrowLeftRight, Bell } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { writeHrdUiMode } from "@/lib/hrdUiMode";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";

/** Studio entry points — first route inside each studio is used as its landing. */
export const STUDIOS = [
  { key: "today",     to: "/today",           icon: Home,          label: "Today" },
  { key: "people",    to: "/users",           icon: Users,         label: "People — сотрудники, треки, паспорт" },
  { key: "analytics", to: "/analytics",       icon: BarChart3,     label: "Analytics — риски, комфорт, продукт" },
  { key: "learning",  to: "/university",      icon: GraduationCap, label: "Learning — обучение, IDP, адаптация" },
  { key: "culture",   to: "/feed",            icon: PartyPopper,   label: "Culture — признание, магазин, пульс" },
  { key: "ops",       to: "/hr-policies",     icon: Settings2,     label: "Ops — политики, документы, поддержка" },
] as const;

/**
 * Compact 56px-wide studio rail. Highlights the active studio group by matching
 * the current URL against a small allow-list of routes per studio.
 */
const STUDIO_MATCH: Record<string, RegExp> = {
  today:     /^\/today/,
  people:    /^\/(users|passport|skills-matrix|positions|career-tracks|idp|career-reviews|employees|team)/,
  analytics: /^\/(analytics|risk-analytics|people-analytics|product-analytics|dashboard)/,
  learning:  /^\/(university|onboarding|adaptation-plans|probation|assessment)/,
  culture:   /^\/(feed|recognition|gamification|shop|pulse-surveys|communities)/,
  ops:       /^\/(hr-policies|hr-documents|leaves|disciplinary|invitations|support|settings|ai-settings|integrations|email-settings|company-branding|rag-documents)/,
};

const StudioRail = () => {
  const { pathname } = useLocation();
  const unread = useUnreadNotifications();

  const switchToClassic = () => {
    writeHrdUiMode("classic");
    window.location.href = "/dashboard";
  };

  return (
    <TooltipProvider delayDuration={100}>
      <aside className="w-14 shrink-0 border-r border-border/60 bg-card/40 flex flex-col items-center py-3 gap-1">
        {STUDIOS.map((s) => {
          const active = STUDIO_MATCH[s.key].test(pathname);
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
