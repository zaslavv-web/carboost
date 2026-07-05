import { laravelDb } from "@/integrations/laravel/db";
import { tooltipProps } from "@/lib/chartTooltip";
import { useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, Sparkles, TrendingDown, TrendingUp, RefreshCw, Users } from "lucide-react";
import { MetricLabel } from "@/components/metrics/MetricLabel";

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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("manager");
  const { data: profile } = useUserProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<"auto" | "manual">("auto");
  const [levelFilter, setLevelFilter] = useState<"all" | "low" | "medium" | "high">("all");
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const applyFilter = (dept: string | null, level: "all" | "low" | "medium" | "high") => {
    setDeptFilter(dept);
    setLevelFilter(level);
    setSelectionMode("auto");
    setSelected(null);
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const pickEmployee = (userId: string) => {
    setSelectionMode("manual");
    setSelected(userId);
  };
  const resetSelection = () => {
    setSelectionMode("auto");
    setSelected(null);
  };

  const { data: employees = [] } = useQuery({
    queryKey: ["company-employees", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await laravelDb
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
      const { data, error } = await laravelDb
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
            attrition > 50 ? t("riskAnalytics.factors.lowCareerActivity") : t("riskAnalytics.factors.stableProgress"),
            burnout > 50 ? t("riskAnalytics.factors.highHrLoad") : t("riskAnalytics.factors.normalLoad"),
            engagement < 50 ? t("riskAnalytics.factors.lowSocialActivity") : t("riskAnalytics.factors.goodEngagement"),
          ],
          recommendations:
            risk_level === "high"
              ? [t("riskAnalytics.recs.oneOnOne"), t("riskAnalytics.recs.reviewGoals"), t("riskAnalytics.recs.reduceLoad")]
              : risk_level === "medium"
              ? [t("riskAnalytics.recs.scheduleReview"), t("riskAnalytics.recs.addMentor")]
              : [t("riskAnalytics.recs.maintainPace")],
        };
      });
      const { error } = await laravelDb
        .from("employee_risk_scores")
        .upsert(upserts, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("riskAnalytics.toast.recalculated"));
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
      const dept = e.department || t("riskAnalytics.noDept");
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

  const filteredEmployees = useMemo(
    () =>
      employees.filter((emp: any) => {
        if (deptFilter && (emp.department || "—") !== deptFilter) return false;
        if (levelFilter === "all") return true;
        const s = scoreMap.get(emp.user_id);
        return s?.risk_level === levelFilter;
      }),
    [employees, scoreMap, deptFilter, levelFilter]
  );

  const autoTopRisk = useMemo(() => {
    let best: { emp: any; score: RiskRow; peak: number } | null = null;
    for (const emp of filteredEmployees) {
      const s = scoreMap.get(emp.user_id);
      if (!s) continue;
      const peak = Math.max(s.attrition_risk, s.burnout_risk);
      if (
        !best ||
        peak > best.peak ||
        (peak === best.peak && s.attrition_risk > best.score.attrition_risk) ||
        (peak === best.peak &&
          s.attrition_risk === best.score.attrition_risk &&
          (emp.full_name ?? "").localeCompare(best.emp.full_name ?? "") < 0)
      ) {
        best = { emp, score: s, peak };
      }
    }
    return best;
  }, [filteredEmployees, scoreMap]);

  const effectiveSelectedId =
    selectionMode === "manual" ? selected : autoTopRisk?.emp.user_id ?? null;
  const selectedScore = effectiveSelectedId ? scoreMap.get(effectiveSelectedId) : null;
  const selectedEmp = effectiveSelectedId
    ? employees.find((e: any) => e.user_id === effectiveSelectedId)
    : null;
  const selectionReason =
    selectionMode === "manual"
      ? t("riskAnalytics.detail.reasonManual", { defaultValue: "Выбран из таблицы вручную" })
      : autoTopRisk
      ? t("riskAnalytics.detail.reasonAuto", {
          defaultValue: "Максимальный риск в текущем срезе ({{peak}})",
          peak: autoTopRisk.peak,
        })
      : "";

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
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{t("riskAnalytics.title")}</h1>
              <p className="text-muted-foreground mt-1 max-w-2xl">
                {t("riskAnalytics.subtitle")}
              </p>
            </div>
          </div>
          <Button
            onClick={() => recompute.mutate()}
            disabled={recompute.isPending}
            className="gradient-primary text-primary-foreground shadow-glow"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${recompute.isPending ? "animate-spin" : ""}`} />
            {t("riskAnalytics.recalcBtn")}
          </Button>
        </div>
      </div>

      {/* KPI cards — clickable, filter the table below */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => applyFilter(deptFilter, "all")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && applyFilter(deptFilter, "all")}
          className={`text-left transition-all cursor-pointer ${levelFilter === "all" ? "ring-2 ring-primary/40 rounded-xl" : ""}`}
        >
          <Card className="glass p-4 hover-lift h-full">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
              <Users className="w-4 h-4" />
              <span onClick={(e) => e.stopPropagation()}>
                <MetricLabel metricKey="headcount_delta" labelOverride={t("riskAnalytics.kpi.employees")} />
              </span>
            </div>
            <div className="mt-2 text-3xl font-bold text-foreground">{summary.total}</div>
            <div className="text-xs text-muted-foreground mt-1">{t("riskAnalytics.kpi.covered", { count: summary.covered })}</div>
          </Card>
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => applyFilter(deptFilter, "high")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && applyFilter(deptFilter, "high")}
          className={`text-left transition-all cursor-pointer ${levelFilter === "high" ? "ring-2 ring-destructive/50 rounded-xl" : ""}`}
        >
          <Card className="glass p-4 hover-lift border-destructive/30 h-full">
            <div className="flex items-center gap-2 text-destructive text-xs uppercase tracking-wide">
              <AlertTriangle className="w-4 h-4" />
              <span onClick={(e) => e.stopPropagation()}>
                <MetricLabel metricKey="risk_index" labelOverride={t("riskAnalytics.kpi.highRisk")} />
              </span>
            </div>
            <div className="mt-2 text-3xl font-bold text-destructive">{summary.high}</div>
            <div className="text-xs text-muted-foreground mt-1">{t("riskAnalytics.kpi.actionRequired")}</div>
          </Card>
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => applyFilter(deptFilter, "medium")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && applyFilter(deptFilter, "medium")}
          className={`text-left transition-all cursor-pointer ${levelFilter === "medium" ? "ring-2 ring-warning/50 rounded-xl" : ""}`}
        >
          <Card className="glass p-4 hover-lift border-warning/30 h-full">
            <div className="flex items-center gap-2 text-warning text-xs uppercase tracking-wide">
              <TrendingDown className="w-4 h-4" />
              <span onClick={(e) => e.stopPropagation()}>
                <MetricLabel metricKey="attrition_forecast" labelOverride={t("riskAnalytics.kpi.mediumRisk")} />
              </span>
            </div>
            <div className="mt-2 text-3xl font-bold text-warning">{summary.medium}</div>
          </Card>
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate("/dashboard")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && navigate("/dashboard")}
          className="text-left transition-all cursor-pointer"
        >
          <Card className="glass p-4 hover-lift border-success/30 h-full">
            <div className="flex items-center gap-2 text-success text-xs uppercase tracking-wide">
              <TrendingUp className="w-4 h-4" />
              <span onClick={(e) => e.stopPropagation()}>
                <MetricLabel metricKey="engagement_index" labelOverride={t("riskAnalytics.kpi.engagement")} />
              </span>
            </div>
            <div className="mt-2 text-3xl font-bold text-success">{summary.avgEngagement}%</div>
          </Card>
        </div>
      </div>



      <div className="grid lg:grid-cols-3 gap-6">
        {/* Heatmap by department */}
        <Card className="glass p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-4">{t("riskAnalytics.heatmap.title")}</h3>
          {byDept.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("riskAnalytics.heatmap.empty")}</p>
          ) : (
            <div className="space-y-2">
              {byDept.map((row) => (
                <div key={row.dept} className="grid grid-cols-12 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => applyFilter(row.dept, "all")}
                    className="col-span-4 text-sm font-medium text-foreground truncate text-left hover:text-primary transition-colors"
                    title={t("riskAnalytics.heatmap.filterByDept", { defaultValue: "Показать всех сотрудников отдела" })}
                  >
                    {row.dept}
                  </button>
                  <div className="col-span-7 flex h-8 rounded-lg overflow-hidden border border-border">
                    {(["high", "medium", "low"] as const).map((lvl) => {
                      const count = row[lvl];
                      const pct = row.total > 0 ? (count / row.total) * 100 : 0;
                      if (pct === 0) return null;
                      const bg =
                        lvl === "high"
                          ? "bg-destructive/80 hover:bg-destructive"
                          : lvl === "medium"
                          ? "bg-warning/70 hover:bg-warning"
                          : "bg-success/70 hover:bg-success";
                      return (
                        <button
                          type="button"
                          key={lvl}
                          onClick={() => applyFilter(row.dept, lvl)}
                          className={`${bg} flex items-center justify-center text-xs font-semibold text-white transition-all cursor-pointer`}
                          style={{ width: `${pct}%` }}
                          title={`${row.dept} · ${lvl}: ${count} — ${t("riskAnalytics.heatmap.clickToFilter", { defaultValue: "клик — фильтр таблицы" })}`}
                        >
                          {pct > 12 ? count : ""}
                        </button>
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
                  <RTooltip {...tooltipProps("bar")} />
                  <Bar
                    dataKey="avgRisk"
                    radius={[6, 6, 0, 0]}
                    onClick={(d: any) => d?.dept && applyFilter(d.dept, "all")}
                    cursor="pointer"
                  >
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
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t("riskAnalytics.detail.title")}</h3>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={`text-[10px] uppercase tracking-wide ${
                    selectionMode === "auto"
                      ? "border-primary/40 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {selectionMode === "auto"
                    ? t("riskAnalytics.detail.modeAuto", { defaultValue: "Топ риска" })
                    : t("riskAnalytics.detail.modeManual", { defaultValue: "Выбран вручную" })}
                </Badge>
                {selectionMode === "manual" && (
                  <button
                    type="button"
                    onClick={resetSelection}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    {t("riskAnalytics.detail.resetSelection", { defaultValue: "Сбросить выбор" })}
                  </button>
                )}
              </div>
            </div>
          </div>
          {!selectedScore || !selectedEmp ? (
            <p className="text-sm text-muted-foreground">
              {filteredEmployees.length === 0
                ? t("riskAnalytics.detail.emptyFilter", {
                    defaultValue: "Под текущий фильтр нет оценённых сотрудников",
                  })
                : t("riskAnalytics.detail.selectEmployee")}
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-base font-semibold text-foreground">{selectedEmp.full_name}</div>
                <div className="text-xs text-muted-foreground">{selectedEmp.position}</div>
                {selectionReason && (
                  <div className="mt-1 text-[11px] text-muted-foreground italic">
                    {selectionReason}
                  </div>
                )}
              </div>
              <Badge className={`${levelColor(selectedScore.risk_level)} border`}>
                {selectedScore.risk_level === "high"
                  ? t("riskAnalytics.detail.highRisk")
                  : selectedScore.risk_level === "medium"
                  ? t("riskAnalytics.detail.mediumRisk")
                  : t("riskAnalytics.detail.lowRisk")}
              </Badge>


              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    innerRadius="40%"
                    outerRadius="100%"
                    data={[
                      { name: t("riskAnalytics.detail.attrition"), value: selectedScore.attrition_risk, fill: "hsl(var(--destructive))" },
                      { name: t("riskAnalytics.detail.burnout"), value: selectedScore.burnout_risk, fill: "hsl(var(--warning))" },
                      { name: t("riskAnalytics.detail.engagementLabel"), value: selectedScore.engagement_score, fill: "hsl(var(--success))" },
                    ]}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar background dataKey="value" cornerRadius={6} />
                    <RTooltip {...tooltipProps("none")} />
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{t("riskAnalytics.detail.factors")}</div>
                <ul className="space-y-1 text-sm">
                  {(Array.isArray(selectedScore.factors) ? selectedScore.factors : typeof selectedScore.factors === "string" ? (() => { try { const p = JSON.parse(selectedScore.factors as any); return Array.isArray(p) ? p : []; } catch { return []; } })() : []).map((f: any, i: number) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span className="text-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> {t("riskAnalytics.detail.recommendations")}
                </div>
                <ul className="space-y-1 text-sm">
                  {(Array.isArray(selectedScore.recommendations) ? selectedScore.recommendations : typeof selectedScore.recommendations === "string" ? (() => { try { const p = JSON.parse(selectedScore.recommendations as any); return Array.isArray(p) ? p : []; } catch { return []; } })() : []).map((r: any, i: number) => (
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
      <Card className="glass p-5" ref={tableRef}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-foreground">{t("riskAnalytics.table.title")}</h3>
          {(deptFilter || levelFilter !== "all") && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">
                {t("riskAnalytics.table.activeFilters", { defaultValue: "Активные фильтры:" })}
              </span>
              {deptFilter && (
                <Badge variant="outline" className="gap-1 pr-1">
                  {deptFilter}
                  <button
                    type="button"
                    onClick={() => setDeptFilter(null)}
                    className="ml-1 rounded hover:bg-secondary/60 p-0.5"
                    aria-label="clear dept"
                  >
                    ✕
                  </button>
                </Badge>
              )}
              {levelFilter !== "all" && (
                <Badge variant="outline" className="gap-1 pr-1">
                  {levelFilter === "high"
                    ? t("riskAnalytics.detail.highRisk")
                    : levelFilter === "medium"
                    ? t("riskAnalytics.detail.mediumRisk")
                    : t("riskAnalytics.detail.lowRisk")}
                  <button
                    type="button"
                    onClick={() => setLevelFilter("all")}
                    className="ml-1 rounded hover:bg-secondary/60 p-0.5"
                    aria-label="clear level"
                  >
                    ✕
                  </button>
                </Badge>
              )}
              <button
                type="button"
                onClick={() => applyFilter(null, "all")}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                {t("riskAnalytics.table.clearAll", { defaultValue: "Сбросить все" })}
              </button>
            </div>
          )}
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("riskAnalytics.table.loading")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="text-left py-2 font-medium">{t("riskAnalytics.table.colEmployee")}</th>
                  <th className="text-left py-2 font-medium">{t("riskAnalytics.table.colDept")}</th>
                  <th className="text-center py-2 font-medium">
                    <MetricLabel metricKey="employee_attrition_risk" labelOverride={t("riskAnalytics.table.colAttrition")} />
                  </th>
                  <th className="text-center py-2 font-medium">
                    <MetricLabel metricKey="burnout_risk" labelOverride={t("riskAnalytics.table.colBurnout")} />
                  </th>
                  <th className="text-center py-2 font-medium">
                    <MetricLabel metricKey="employee_engagement" labelOverride={t("riskAnalytics.table.colEngagement")} />
                  </th>
                  <th className="text-center py-2 font-medium">
                    <MetricLabel metricKey="employee_risk_level" labelOverride={t("riskAnalytics.table.colLevel")} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp: any) => {
                  const s = scoreMap.get(emp.user_id);
                  return (
                    <tr
                      key={emp.user_id}
                      onClick={() => pickEmployee(emp.user_id)}
                      className={`border-t border-border cursor-pointer hover:bg-secondary/40 transition-colors ${
                        effectiveSelectedId === emp.user_id ? "bg-primary/10" : ""
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
                          <span className="text-muted-foreground text-xs">{t("riskAnalytics.table.notScored")}</span>
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
