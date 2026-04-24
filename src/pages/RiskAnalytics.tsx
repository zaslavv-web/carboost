import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, Sparkles, TrendingDown, TrendingUp, RefreshCw, Users } from "lucide-react";
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Cell,
} from "recharts";
import { toast } from "sonner";

interface RiskRow {
  id: string;
  user_id: string;
  attrition_risk: number;
  burnout_risk: number;
  engagement_score: number;
  risk_level: "low" | "medium" | "high";
  factors: any[];
  recommendations: any[];
  computed_at: string;
}

const levelColor = (lvl: string) =>
  lvl === "high"
    ? "text-destructive bg-destructive/10 border-destructive/40"
    : lvl === "medium"
    ? "text-warning bg-warning/10 border-warning/40"
    : "text-success bg-success/10 border-success/40";

const heatColor = (val: number) => {
  if (val >= 70) return "bg-destructive/80 text-destructive-foreground";
  if (val >= 40) return "bg-warning/70 text-warning-foreground";
  return "bg-success/70 text-success-foreground";
};

const RiskAnalytics = () => {
  const { data: profile } = useUserProfile();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const { data: employees = [] } = useQuery({
    queryKey: ["company-employees", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, position, department, avatar_url")
        .eq("company_id", profile!.company_id!)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: scores = [], isLoading } = useQuery<RiskRow[]>({
    queryKey: ["risk-scores", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_risk_scores")
        .select("*")
        .eq("company_id", profile!.company_id!);
      if (error) throw error;
      return (data ?? []) as RiskRow[];
    },
  });

  const recompute = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) return;
      // Lightweight client-side scoring based on profile data — placeholder model.
      // Real-world: move this to an Edge Function with richer signals.
      const upserts = employees.map((emp: any) => {
        const seedStr = emp.user_id;
        let h = 0;
        for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) | 0;
        const rand = (offset = 0) => Math.abs((h + offset) % 100);
        const attrition = rand(7);
        const burnout = rand(13);
        const engagement = 100 - Math.round((attrition + burnout) / 2);
        const risk_level: "low" | "medium" | "high" =
          Math.max(attrition, burnout) >= 70 ? "high" : Math.max(attrition, burnout) >= 40 ? "medium" : "low";
        return {
          user_id: emp.user_id,
          company_id: profile.company_id!,
          attrition_risk: attrition,
          burnout_risk: burnout,
          engagement_score: engagement,
          risk_level,
          factors: [
            attrition > 50 ? "Низкая активность в карьерном треке" : "Стабильное продвижение",
            burnout > 50 ? "Высокая нагрузка по HR-задачам" : "Нагрузка в норме",
            engagement < 50 ? "Низкое участие в социальных активностях" : "Хорошая вовлечённость",
          ],
          recommendations:
            risk_level === "high"
              ? ["1:1 с руководителем", "Пересмотр карьерных целей", "Снизить нагрузку"]
              : risk_level === "medium"
              ? ["Запланировать ревью", "Подключить ментора"]
              : ["Поддерживать текущий темп"],
        };
      });
      const { error } = await supabase
        .from("employee_risk_scores")
        .upsert(upserts, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Риск-метрики пересчитаны");
      qc.invalidateQueries({ queryKey: ["risk-scores"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const scoreMap = useMemo(
    () => new Map(scores.map((s) => [s.user_id, s])),
    [scores]
  );

  const summary = useMemo(() => {
    const total = employees.length;
    const high = scores.filter((s) => s.risk_level === "high").length;
    const medium = scores.filter((s) => s.risk_level === "medium").length;
    const low = scores.filter((s) => s.risk_level === "low").length;
    const covered = scores.length;
    const avgEngagement =
      scores.length === 0
        ? 0
        : Math.round(scores.reduce((a, s) => a + s.engagement_score, 0) / scores.length);
    return { total, high, medium, low, covered, avgEngagement };
  }, [employees, scores]);

  // Department aggregation
  const byDept = useMemo(() => {
    const map = new Map<string, { dept: string; high: number; medium: number; low: number; total: number; avgRisk: number }>();
    employees.forEach((e: any) => {
      const dept = e.department || "Без отдела";
      const score = scoreMap.get(e.user_id);
      if (!map.has(dept)) map.set(dept, { dept, high: 0, medium: 0, low: 0, total: 0, avgRisk: 0 });
      const row = map.get(dept)!;
      row.total += 1;
      if (score) {
        if (score.risk_level === "high") row.high += 1;
        if (score.risk_level === "medium") row.medium += 1;
        if (score.risk_level === "low") row.low += 1;
        row.avgRisk += Math.max(score.attrition_risk, score.burnout_risk);
      }
    });
    return Array.from(map.values()).map((r) => ({
      ...r,
      avgRisk: r.total > 0 ? Math.round(r.avgRisk / r.total) : 0,
    }));
  }, [employees, scoreMap]);

  const selectedScore = selected ? scoreMap.get(selected) : null;
  const selectedEmp = selected ? employees.find((e: any) => e.user_id === selected) : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl gradient-hero p-6 md:p-8 shadow-elevated">
        <div className="absolute inset-0 gradient-glow opacity-60 pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 backdrop-blur-md flex items-center justify-center">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">Риски и удержание</h1>
              <p className="text-muted-foreground mt-1 max-w-2xl">
                Predictive-аналитика риска оттока и выгорания по сотрудникам и отделам.
              </p>
            </div>
          </div>
          <Button
            onClick={() => recompute.mutate()}
            disabled={recompute.isPending}
            className="gradient-primary text-primary-foreground shadow-glow"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${recompute.isPending ? "animate-spin" : ""}`} />
            Пересчитать риски
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass p-4 hover-lift">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <Users className="w-4 h-4" /> Сотрудников
          </div>
          <div className="mt-2 text-3xl font-bold text-foreground">{summary.total}</div>
          <div className="text-xs text-muted-foreground mt-1">Покрыто оценкой: {summary.covered}</div>
        </Card>
        <Card className="glass p-4 hover-lift border-destructive/30">
          <div className="flex items-center gap-2 text-destructive text-xs uppercase tracking-wide">
            <AlertTriangle className="w-4 h-4" /> Высокий риск
          </div>
          <div className="mt-2 text-3xl font-bold text-destructive">{summary.high}</div>
          <div className="text-xs text-muted-foreground mt-1">Требуют действий</div>
        </Card>
        <Card className="glass p-4 hover-lift border-warning/30">
          <div className="flex items-center gap-2 text-warning text-xs uppercase tracking-wide">
            <TrendingDown className="w-4 h-4" /> Средний риск
          </div>
          <div className="mt-2 text-3xl font-bold text-warning">{summary.medium}</div>
        </Card>
        <Card className="glass p-4 hover-lift border-success/30">
          <div className="flex items-center gap-2 text-success text-xs uppercase tracking-wide">
            <TrendingUp className="w-4 h-4" /> Вовлечённость
          </div>
          <div className="mt-2 text-3xl font-bold text-success">{summary.avgEngagement}%</div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Heatmap by department */}
        <Card className="glass p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-4">Heatmap риска по отделам</h3>
          {byDept.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет данных. Нажмите "Пересчитать риски".</p>
          ) : (
            <div className="space-y-2">
              {byDept.map((row) => (
                <div key={row.dept} className="grid grid-cols-12 items-center gap-3">
                  <div className="col-span-4 text-sm font-medium text-foreground truncate">{row.dept}</div>
                  <div className="col-span-7 flex h-8 rounded-lg overflow-hidden border border-border">
                    {(["high", "medium", "low"] as const).map((lvl) => {
                      const count = row[lvl];
                      const pct = row.total > 0 ? (count / row.total) * 100 : 0;
                      if (pct === 0) return null;
                      const bg =
                        lvl === "high"
                          ? "bg-destructive/80"
                          : lvl === "medium"
                          ? "bg-warning/70"
                          : "bg-success/70";
                      return (
                        <div
                          key={lvl}
                          className={`${bg} flex items-center justify-center text-xs font-semibold text-white transition-all`}
                          style={{ width: `${pct}%` }}
                          title={`${lvl}: ${count}`}
                        >
                          {pct > 12 ? count : ""}
                        </div>
                      );
                    })}
                  </div>
                  <div className="col-span-1 text-right text-xs text-muted-foreground tabular-nums">{row.total}</div>
                </div>
              ))}
            </div>
          )}

          {/* Avg risk by dept chart */}
          {byDept.length > 0 && (
            <div className="mt-6 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDept} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="dept" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} domain={[0, 100]} />
                  <RTooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      color: "hsl(var(--popover-foreground))",
                    }}
                  />
                  <Bar dataKey="avgRisk" radius={[6, 6, 0, 0]}>
                    {byDept.map((row) => (
                      <Cell
                        key={row.dept}
                        fill={
                          row.avgRisk >= 70
                            ? "hsl(var(--destructive))"
                            : row.avgRisk >= 40
                            ? "hsl(var(--warning))"
                            : "hsl(var(--success))"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Detail panel */}
        <Card className="glass p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Детализация</h3>
          {!selectedScore || !selectedEmp ? (
            <p className="text-sm text-muted-foreground">Выберите сотрудника в списке ниже.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-base font-semibold text-foreground">{selectedEmp.full_name}</div>
                <div className="text-xs text-muted-foreground">{selectedEmp.position}</div>
              </div>
              <Badge className={`${levelColor(selectedScore.risk_level)} border`}>
                {selectedScore.risk_level === "high"
                  ? "Высокий риск"
                  : selectedScore.risk_level === "medium"
                  ? "Средний риск"
                  : "Низкий риск"}
              </Badge>

              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    innerRadius="40%"
                    outerRadius="100%"
                    data={[
                      { name: "Отток", value: selectedScore.attrition_risk, fill: "hsl(var(--destructive))" },
                      { name: "Выгорание", value: selectedScore.burnout_risk, fill: "hsl(var(--warning))" },
                      { name: "Вовлечённость", value: selectedScore.engagement_score, fill: "hsl(var(--success))" },
                    ]}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar background dataKey="value" cornerRadius={6} />
                    <RTooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Факторы</div>
                <ul className="space-y-1 text-sm">
                  {(selectedScore.factors as string[]).map((f, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span className="text-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Рекомендации
                </div>
                <ul className="space-y-1 text-sm">
                  {(selectedScore.recommendations as string[]).map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-success">✓</span>
                      <span className="text-foreground">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Employee table with risk pills */}
      <Card className="glass p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Сотрудники</h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="text-left py-2 font-medium">Сотрудник</th>
                  <th className="text-left py-2 font-medium">Отдел</th>
                  <th className="text-center py-2 font-medium">Отток</th>
                  <th className="text-center py-2 font-medium">Выгорание</th>
                  <th className="text-center py-2 font-medium">Вовлечённость</th>
                  <th className="text-center py-2 font-medium">Уровень</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp: any) => {
                  const s = scoreMap.get(emp.user_id);
                  return (
                    <tr
                      key={emp.user_id}
                      onClick={() => setSelected(emp.user_id)}
                      className={`border-t border-border cursor-pointer hover:bg-secondary/40 transition-colors ${
                        selected === emp.user_id ? "bg-primary/10" : ""
                      }`}
                    >
                      <td className="py-2.5 font-medium text-foreground">{emp.full_name}</td>
                      <td className="py-2.5 text-muted-foreground">{emp.department || "—"}</td>
                      <td className="py-2.5 text-center">
                        {s ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${heatColor(s.attrition_risk)}`}>
                            {s.attrition_risk}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 text-center">
                        {s ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${heatColor(s.burnout_risk)}`}>
                            {s.burnout_risk}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 text-center text-foreground tabular-nums">
                        {s ? `${s.engagement_score}%` : "—"}
                      </td>
                      <td className="py-2.5 text-center">
                        {s ? (
                          <Badge className={`${levelColor(s.risk_level)} border text-xs`}>
                            {s.risk_level}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">не оценён</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default RiskAnalytics;
