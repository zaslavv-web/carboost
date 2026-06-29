import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface RailItem {
  to?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  active?: boolean;
  badge?: ReactNode;
}

interface Props {
  primary: RailItem[];
  secondary?: RailItem[];
  topSlot?: ReactNode;
  bottomSlot?: ReactNode;
}

const Btn = ({ item }: { item: RailItem }) => {
  const Icon = item.icon;
  const base =
    "group relative w-9 h-9 mx-auto flex items-center justify-center rounded-md transition-colors";
  const inactive = "text-muted-foreground hover:bg-secondary hover:text-foreground";
  const active = "bg-primary/10 text-primary";

  const inner = (
    <>
      <Icon className="w-[18px] h-[18px]" />
      {item.badge && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 rounded-full bg-primary text-primary-foreground text-[9px] leading-[14px] text-center font-semibold">
          {item.badge}
        </span>
      )}
    </>
  );

  const node = item.to ? (
    <NavLink
      to={item.to}
      end
      className={({ isActive }) => cn(base, isActive || item.active ? active : inactive)}
    >
      {({ isActive }) => (
        <>
          {(isActive || item.active) && (
            <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-full bg-primary" />
          )}
          {inner}
        </>
      )}
    </NavLink>
  ) : (
    <button type="button" onClick={item.onClick} className={cn(base, item.active ? active : inactive)}>
      {item.active && <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-full bg-primary" />}
      {inner}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={6}>{item.label}</TooltipContent>
    </Tooltip>
  );
};

/**
 * Vertical context rail (44px), PS-toolbar style. Holds view-switcher icons
 * with primary/secondary groups separated by a divider.
 */
const ContextRail = ({ primary, secondary, topSlot, bottomSlot }: Props) => (
  <TooltipProvider delayDuration={200}>
    <aside className="w-11 shrink-0 bg-card border-r border-border/60 flex flex-col py-2 gap-1">
      {topSlot && <div className="px-1 pb-1.5 border-b border-border/60 mb-1.5">{topSlot}</div>}
      <div className="flex flex-col gap-0.5">
        {primary.map((i) => <Btn key={i.label} item={i} />)}
      </div>
      {secondary && secondary.length > 0 && (
        <>
          <div className="mx-2 my-1 border-t border-border/60" />
          <div className="flex flex-col gap-0.5">
            {secondary.map((i) => <Btn key={i.label} item={i} />)}
          </div>
        </>
      )}
      <div className="flex-1" />
      {bottomSlot && <div className="px-1 pt-1.5 border-t border-border/60 mt-1.5">{bottomSlot}</div>}
    </aside>
  </TooltipProvider>
);

export default ContextRail;
