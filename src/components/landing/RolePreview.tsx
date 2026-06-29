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
  AlertTriangle,
  ArrowRight,
  Clock,
} from "lucide-react";

type RoleKey = "hrd" | "manager" | "employee";

const serif = { fontFamily: "'Instrument Serif', Georgia, serif" };

/* ─────────────────────────────────────────────────────────────────
 * Each role has:
 *  - pain (what hurts today)
 *  - solution (what changes with Growth Peak)
 *  - mock — an information-dense, theme-aware "after" screen that
 *           visually closes the JTBD.
 * ─────────────────────────────────────────────────────────────── */

const HRDMock = () => (
  <div className="w-full aspect-[16/10] rounded-2xl bg-card border border-border shadow-elevated overflow-hidden flex">
    <div className="w-[22%] bg-muted/40 border-r border-border p-3 flex flex-col gap-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground px-2 mb-1">HRD</div>
      {[
        { I: ShieldCheck, l: "Риски", active: true },
        { I: BarChart3, l: "Аналитика" },
        { I: Users, l: "Сотрудники" },
        { I: Activity, l: "Активность" },
      ].map(({ I, l, active }, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-medium ${
            active ? "bg-primary/15 text-primary" : "text-muted-foreground"
          }`}
        >
          <I className="w-3 h-3" /> {l}
        </div>
      ))}
    </div>

    <div className="flex-1 p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-foreground">Карта рисков · 800 сотрудников</div>
        <div className="px-2 py-0.5 rounded-full bg-success/15 text-success text-[9px] font-bold">
          Live
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { v: "12%", l: "Текучесть", trend: "−9 п.п.", good: true },
          { v: "82", l: "eNPS", trend: "+14", good: true },
          { v: "5", l: "High-risk", trend: "AI flagged", good: false },
          { v: "₽2.4М", l: "Сэкономлено", trend: "/квартал", good: true },
        ].map((k, i) => (
          <div key={i} className="rounded-xl border border-border p-2 bg-background">
            <div className="text-[8px] uppercase tracking-wider text-muted-foreground">{k.l}</div>
            <div className="text-base font-bold text-foreground mt-0.5 tabular-nums">{k.v}</div>
            <div
              className={`text-[8px] font-semibold mt-0.5 ${
                k.good ? "text-success" : "text-destructive"
              }`}
            >
              {k.trend}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border p-2.5 bg-background flex-1 flex flex-col gap-2 min-h-0">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold text-foreground">Преемственность · Sr Backend</div>
          <div className="text-[9px] text-muted-foreground">3 кандидата</div>
        </div>
        <div className="flex-1 flex items-end gap-1">
          {[40, 55, 35, 70, 60, 85, 75, 90, 78, 92, 88, 95].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-gradient-to-t from-primary/70 to-primary/30"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
          <span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span>
        </div>
      </div>
    </div>
  </div>
);

const ManagerMock = () => (
  <div className="w-full aspect-[16/10] rounded-2xl bg-card border border-border shadow-elevated overflow-hidden p-4 flex flex-col gap-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Briefcase className="w-4 h-4 text-primary" />
        <div className="text-xs font-semibold text-foreground">Моя команда · 8 человек</div>
      </div>
      <div className="flex gap-1.5">
        <div className="px-2 py-0.5 rounded-full bg-success/15 text-success text-[9px] font-bold">+12% к плану</div>
        <div className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[9px] font-bold">1 риск</div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2 flex-1 min-h-0">
      {[
        { name: "А. Петров", role: "Mid Dev", pct: 78, risk: false, lvl: 5 },
        { name: "М. Ким", role: "Senior PM", pct: 92, risk: false, lvl: 8 },
        { name: "С. Орлов", role: "Junior QA", pct: 34, risk: true, lvl: 2 },
        { name: "Е. Лю", role: "Designer", pct: 65, risk: false, lvl: 6 },
      ].map((m, i) => (
        <div key={i} className="rounded-xl border border-border p-2.5 bg-background flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center text-[9px] font-bold text-primary-foreground">
              L{m.lvl}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10.5px] font-semibold text-foreground truncate">{m.name}</div>
              <div className="text-[9px] text-muted-foreground truncate">{m.role}</div>
            </div>
            {m.risk ? (
              <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
            ) : (
              <Target className="w-3.5 h-3.5 text-primary" />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${m.risk ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${m.pct}%` }}
              />
            </div>
            <span className="text-[9px] font-bold text-foreground tabular-nums">{m.pct}%</span>
          </div>
        </div>
      ))}
    </div>

    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2 flex items-center gap-2 text-[10px] text-foreground">
      <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
      <span>AI: С. Орлов отстаёт от плана 2 недели — назначить 1:1 на эту пятницу?</span>
      <button className="ml-auto px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">Назначить</button>
    </div>
  </div>
);

const EmployeeMock = () => (
  <div className="w-full aspect-[16/10] rounded-2xl bg-card border border-border shadow-elevated overflow-hidden p-4 flex gap-3">
    <div className="w-1/3 rounded-xl border border-border p-3 bg-background flex flex-col items-center text-center gap-2">
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center text-base font-bold text-primary-foreground">
        МА
      </div>
      <div className="text-[11px] font-semibold text-foreground">Мария А.</div>
      <div className="text-[9px] text-muted-foreground">Product Analyst</div>
      <div className="mt-1 px-2 py-1 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center gap-1">
        <Sparkles className="w-3 h-3" /> LVL 7 · 2 480 XP
      </div>
      <div className="w-full h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: "62%" }} />
      </div>
      <div className="text-[9px] text-muted-foreground">До LVL 8 — 1 520 XP</div>
    </div>

    <div className="flex-1 flex flex-col gap-2 min-w-0">
      <div className="rounded-xl border border-border p-3 bg-background flex-1 flex flex-col gap-1.5">
        <div className="text-[10.5px] font-semibold text-foreground flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5 text-primary" /> Карьерный трек → Senior Analyst
        </div>
        {[
          { s: "Junior", done: true },
          { s: "Middle", done: true },
          { s: "Senior", done: false, p: 40, current: true },
          { s: "Lead", done: false, p: 0 },
        ].map((s, i) => (
          <div key={s.s} className="flex items-center gap-2">
            <CheckCircle2 className={`w-3.5 h-3.5 ${s.done ? "text-success" : "text-muted-foreground/40"}`} />
            <div className="flex-1">
              <div className="text-[10px] text-foreground flex justify-between">
                <span>{s.s}</span>
                {s.current && <span className="text-primary font-bold">сейчас</span>}
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: s.done ? "100%" : `${s.p ?? 0}%` }} />
              </div>
            </div>
            {s.current && <Award className="w-3.5 h-3.5 text-primary" />}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border p-2.5 bg-background flex items-center gap-2 text-[10px] text-foreground">
        <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="truncate">Следующий шаг: курс «SQL для аналитики» — +180 XP</span>
        <button className="ml-auto px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold whitespace-nowrap">
          Открыть
        </button>
      </div>
    </div>
  </div>
);

const MOCKS: Record<RoleKey, () => JSX.Element> = {
  hrd: HRDMock,
  manager: ManagerMock,
  employee: EmployeeMock,
};

const RolePreview = () => {
  const { t } = useTranslation("landing");
  const [role, setRole] = useState<RoleKey>("hrd");

  // Re-uses stories.items.{role}.{before|after|persona} content that already exists in i18n
  const storiesRole = role === "manager" ? "lead" : role; // manager screen maps to "lead" persona

  const roles: { key: RoleKey; label: string; icon: typeof Briefcase }[] = [
    { key: "hrd", label: t("audience.hrd.label"), icon: ShieldCheck },
    { key: "manager", label: t("audience.manager.label"), icon: Briefcase },
    { key: "employee", label: t("audience.employee.label"), icon: Users },
  ];

  const Mock = MOCKS[role];

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

      <div key={role} className="grid lg:grid-cols-[1fr_1.4fr] gap-6 lg:gap-10 items-stretch animate-fade-in">
        {/* JTBD pain → solution column */}
        <div className="flex flex-col gap-4">
          <div className="text-[11px] uppercase tracking-[0.25em] font-semibold text-muted-foreground">
            {t(`stories.items.${storiesRole}.persona`)}
          </div>

          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-destructive mb-2">
              <AlertTriangle className="w-4 h-4" /> {t("stories.before")}
            </div>
            <p style={serif} className="text-lg md:text-xl leading-snug text-foreground">
              {t(`stories.items.${storiesRole}.before`)}
            </p>
          </div>

          <div className="flex items-center gap-2 text-primary text-xs font-bold tracking-wider uppercase justify-center">
            <span className="h-px bg-primary/40 flex-1" />
            <ArrowRight className="w-4 h-4" />
            <span className="h-px bg-primary/40 flex-1" />
          </div>

          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary mb-2">
              <Sparkles className="w-4 h-4" /> {t("stories.after")}
            </div>
            <p style={serif} className="text-lg md:text-xl leading-snug text-foreground">
              {t(`stories.items.${storiesRole}.after`)}
            </p>
          </div>
        </div>

        {/* Solution mock */}
        <div className="self-center">
          <Mock />
        </div>
      </div>
    </div>
  );
};

export default RolePreview;
