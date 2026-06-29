import { TrendingDown, TrendingUp, AlertTriangle, Users, Target, Sparkles } from "lucide-react";

/**
 * Static, deterministic visualisation of an HRD dashboard for the hero slot.
 * No data fetching — pure presentation so it renders instantly and screenshots
 * cleanly. Uses only semantic design tokens.
 */
const serif = { fontFamily: "'Instrument Serif', Georgia, serif" };

const Spark = ({ values, color = "primary" }: { values: number[]; color?: "primary" | "destructive" | "success" }) => {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const w = 120;
  const h = 36;
  const step = w / (values.length - 1);
  const path = values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / Math.max(1, max - min)) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={path} fill="none" stroke={`hsl(var(--${color}))`} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};

const HeroDashboardMock = () => {
  return (
    <div className="relative w-full max-w-[560px] mx-auto animate-fade-in">
      {/* Glow */}
      <div
        className="absolute -inset-10 rounded-full blur-3xl opacity-40 pointer-events-none"
        style={{ background: "radial-gradient(circle at center, hsl(var(--primary) / 0.35), transparent 65%)" }}
      />

      {/* Window frame */}
      <div className="relative rounded-2xl border border-border bg-card shadow-elevated overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/40">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-warning/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-success/70" />
          <div className="ml-3 text-xs text-muted-foreground font-mono">growth-peak.pro / hrd</div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Greeting */}
          <div className="flex items-center justify-between">
            <div>
              <div style={serif} className="text-2xl leading-tight">Доброе утро, Анна</div>
              <div className="text-xs text-muted-foreground mt-0.5">Сводка по компании · сегодня</div>
            </div>
            <div className="text-xs px-2.5 py-1 rounded-full bg-success/15 text-success font-medium">Всё в норме</div>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border p-3 bg-background">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Users className="w-3 h-3" /> Штат
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">842</div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-success">
                <TrendingUp className="w-3 h-3" /> +12 за месяц
              </div>
            </div>
            <div className="rounded-xl border border-border p-3 bg-background">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <TrendingDown className="w-3 h-3" /> Текучесть
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">17<span className="text-base">%</span></div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-success">
                <TrendingDown className="w-3 h-3" /> −11 пп
              </div>
            </div>
            <div className="rounded-xl border border-border p-3 bg-background">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Target className="w-3 h-3" /> Цели Q
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">78<span className="text-base">%</span></div>
              <div className="mt-1 text-[11px] text-muted-foreground">62 из 79 KR</div>
            </div>
          </div>

          {/* Risk panel */}
          <div className="rounded-xl border border-border p-4 bg-background">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Риск ухода — высокий</div>
                  <div className="text-[11px] text-muted-foreground">AI-прогноз на 60 дней</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold tabular-nums text-destructive">14</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">сотрудников</div>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { name: "М. Петрова", role: "Senior Designer", risk: 87 },
                { name: "А. Соколов", role: "Tech Lead", risk: 81 },
                { name: "И. Морозов", role: "Product Manager", risk: 74 },
              ].map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">
                    {p.name.split(" ").map((x) => x[0]).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{p.role}</div>
                  </div>
                  <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-destructive"
                      style={{ width: `${p.risk}%` }}
                    />
                  </div>
                  <div className="text-[11px] tabular-nums text-muted-foreground w-7 text-right">{p.risk}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Engagement trend */}
          <div className="rounded-xl border border-border p-4 bg-background flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Sparkles className="w-3 h-3" /> Вовлечённость
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums">8.4 / 10</div>
              <div className="text-[11px] text-success">+0.6 за квартал</div>
            </div>
            <Spark values={[6.4, 6.8, 7.1, 7.0, 7.6, 7.9, 8.1, 8.4]} color="success" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroDashboardMock;
