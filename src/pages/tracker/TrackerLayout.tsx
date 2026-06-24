import { Outlet, NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Target, ListChecks, CalendarClock, LayoutDashboard } from "lucide-react";

const tabs = [
  { to: "/tracker/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { to: "/tracker/goals", label: "Цели (OKR)", icon: Target },
  { to: "/tracker/tasks", label: "Поручения", icon: ListChecks },
  { to: "/tracker/one-on-ones", label: "Встречи 1:1", icon: CalendarClock },
];

const TrackerLayout = () => {
  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Трекер</h1>
        <p className="text-sm text-muted-foreground">
          Цели, поручения и встречи 1:1 в одном месте — связи «поручение ↔ цель» и здоровье команды.
        </p>
      </header>

      <nav className="flex gap-1 border-b border-border overflow-x-auto -mx-1 px-1">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cn(
                "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )
            }
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
};

export default TrackerLayout;
