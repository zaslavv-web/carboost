import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Users,
  Target,
  Activity,
  Award,
  ShieldCheck,
  Briefcase,
  Sparkles,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";

type RoleKey = "hrd" | "manager" | "employee";

interface MockProps {
  role: RoleKey;
}

/**
 * Stylized in-browser mockup of a dashboard — pure SVG/HTML so it scales,
 * adapts to theme and animates without a real screenshot.
 */
const RoleMock = ({ role }: MockProps) => {
  if (role === "hrd") {
    return (
      <div className="w-full aspect-[16/10] rounded-2xl bg-card border border-border shadow-elevated overflow-hidden flex">
        {/* sidebar */}
        <div className="w-1/5 bg-muted/40 border-r border-border p-3 flex flex-col gap-2">
          {[ShieldCheck, BarChart3, Users, Activity].map((I, i) => (
            <div key={i} className={`flex items-center gap-2 p-2 rounded-lg ${i === 1 ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
              <I className="w-3.5 h-3.5" />
              <div className="h-1.5 rounded bg-current opacity-50 w-12" />
            </div>
          ))}
        </div>
        {/* content */}
        <div className="flex-1 p-4 flex flex-col gap-3">
          {/* KPI row */}
          <div className="grid grid-cols-4 gap-2">
            {[{ v: "23", l: "Сотрудников" }, { v: "82", l: "Engagement" }, { v: "12%", l: "Риск" }, { v: "5", l: "Алерты" }].map((k, i) => (
              <div key={i} className="rounded-xl border border-border p-2 bg-background">
                <div className="text-[8px] uppercase tracking-wider text-muted-foreground">{k.l}</div>
                <div className="text-lg font-bold text-foreground mt-1">{k.v}</div>
              </div>
            ))}
          </div>
          {/* Chart */}
          <div className="rounded-xl border border-border p-3 bg-background flex-1 flex items-end gap-1">
            {[40, 55, 35, 70, 60, 85, 75, 90, 65, 80, 95, 88].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-gradient-to-t from-primary/80 to-primary/40 animate-fade-in"
                style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (role === "manager") {
    return (
      <div className="w-full aspect-[16/10] rounded-2xl bg-card border border-border shadow-elevated overflow-hidden p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-foreground text-sm">Моя команда · 8</div>
          <div className="px-2 py-1 rounded-full bg-success/15 text-success text-[10px] font-semibold">+12% к плану</div>
        </div>
        <div className="grid grid-cols-2 gap-2 flex-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-border p-3 bg-background animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-primary/20" />
                <div className="flex-1">
                  <div className="h-2 rounded bg-foreground/70 w-20" />
                  <div className="h-1.5 rounded bg-muted-foreground/40 w-12 mt-1" />
                </div>
                <Target className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${30 + i * 18}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // employee
  return (
    <div className="w-full aspect-[16/10] rounded-2xl bg-card border border-border shadow-elevated overflow-hidden p-4 flex gap-3">
      {/* profile card */}
      <div className="w-1/3 rounded-xl border border-border p-3 bg-background flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/40" />
        <div className="h-2 w-20 rounded bg-foreground/70" />
        <div className="h-1.5 w-14 rounded bg-muted-foreground/40" />
        <div className="mt-2 px-2 py-1 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> LVL 7
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
          <div className="h-full bg-primary rounded-full w-3/5" />
        </div>
      </div>
      {/* track */}
      <div className="flex-1 rounded-xl border border-border p-3 bg-background flex flex-col gap-2">
        <div className="text-xs font-semibold text-foreground flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5 text-primary" /> Карьерный трек
        </div>
        {["Junior", "Middle", "Senior", "Lead"].map((s, i) => (
          <div key={s} className="flex items-center gap-2 animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
            <CheckCircle2 className={`w-4 h-4 ${i < 2 ? "text-success" : "text-muted-foreground/40"}`} />
            <div className="flex-1">
              <div className="text-[11px] text-foreground">{s}</div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: i < 2 ? "100%" : i === 2 ? "40%" : "0%" }} />
              </div>
            </div>
            {i === 2 && <Award className="w-3.5 h-3.5 text-primary animate-pulse" />}
          </div>
        ))}
      </div>
    </div>
  );
};

const RolePreview = () => {
  const { t } = useTranslation("landing");
  const [role, setRole] = useState<RoleKey>("hrd");

  const roles: { key: RoleKey; label: string; caption: string; icon: typeof Briefcase }[] = [
    { key: "hrd", label: t("audience.hrd.label"), caption: t("audience.hrd.caption"), icon: ShieldCheck },
    { key: "manager", label: t("audience.manager.label"), caption: t("audience.manager.caption"), icon: Briefcase },
    { key: "employee", label: t("audience.employee.label"), caption: t("audience.employee.caption"), icon: Users },
  ];

  const active = roles.find((r) => r.key === role)!;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-8 justify-center">
        {roles.map((r) => {
          const Icon = r.icon;
          const isActive = r.key === role;
          return (
            <button
              key={r.key}
              onClick={() => setRole(r.key)}
              className={[
                "inline-flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all text-sm font-medium",
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-glow"
                  : "bg-card text-foreground border-border hover:bg-secondary",
              ].join(" ")}
            >
              <Icon className="w-4 h-4" /> {r.label}
            </button>
          );
        })}
      </div>
      <div className="relative">
        <div key={role} className="animate-fade-in">
          <RoleMock role={role} />
        </div>
        <p className="text-center mt-6 text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
          {active.caption}
        </p>
      </div>
    </div>
  );
};

export default RolePreview;
