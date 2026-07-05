/**
 * Comfort Analytics — уровень компании (Волна 7).
 * Дашборд-заглушка с drill-down по отделам и топу рисковых руководителей.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { laravel } from "@/integrations/laravel/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, RadarChart,
  PolarGrid, PolarAngleAxis, Radar,
} from "recharts";
import { Loader2, TrendingUp, TrendingDown, Minus, ArrowRight, RefreshCw } from "lucide-react";
import { tooltipProps } from "@/lib/chartTooltip";
import { toast } from "@/hooks/use-toast";
import { MetricLabel } from "@/components/metrics/MetricLabel";
import { ChartExplainer } from "@/components/metrics/ChartExplainer";
import type { MetricKey } from "@/lib/metricsCatalog";


type Score = {
  comfort_index: number; tov_score: number; kpi_score: number; career_score: number;
  risk_level: "low" | "medium" | "high" | "critical"; trend: "up" | "flat" | "down"; trend_delta: number;
  factors: any[]; recommendations: string[];
};
type Dept = Score & { scope_id: string; name: string };
type Manager = { manager_id: string; name: string; team_size: number; risky: number; avg_index: number };

const riskColor: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  critical: "bg-red-500/15 text-red-500 border-red-500/30",
};
const riskLabel: Record<string, string> = { low: "Комфортно", medium: "Умеренно", high: "Риск", critical: "Критично" };

export default function ComfortCompany() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [company, setCompany] = useState<Score | null>(null);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [trend, setTrend] = useState<any[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);

  async function load() {
    setLoading(true);
    const { data } = await laravel.get<any>("/comfort/company");
    setCompany(data?.company ?? null);
    setDepartments(data?.departments ?? []);
    setTrend(data?.trend ?? []);
    setManagers(data?.top_risky_managers ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function recompute() {
    setRefreshing(true);
    const { error } = await laravel.post<any>("/comfort/recompute", {});
    setRefreshing(false);
    if (error) return toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    toast({ title: "Пересчёт завершён" });
    load();
  }

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const radar = company ? [
    { k: "Тон общения", v: company.tov_score },
    { k: "KPI", v: company.kpi_score },
    { k: "Карьера", v: company.career_score },
  ] : [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-serif">Комфорт работы</h1>
          <p className="text-sm text-muted-foreground">
            Предиктивный индекс комфорта: тон общения, исполнение KPI и движение по карьерному треку.
          </p>
        </div>
        <Button variant="outline" onClick={recompute} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} /> Пересчитать
        </Button>
      </header>

      {company ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KpiTile metricKey="comfort_index" label="Индекс комфорта компании" value={company.comfort_index} trend={company.trend} delta={company.trend_delta} risk={company.risk_level} />
          <KpiTile label="Тон общения (0–100)" value={company.tov_score} />
          <KpiTile label="Исполнение KPI (0–100)" value={company.kpi_score} />
          <KpiTile label="Карьерный рост (0–100)" value={company.career_score} />

        </div>
      ) : (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Данных пока нет. Нажмите «Пересчитать».</CardContent></Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base"><ChartExplainer metricKey="comfort_index" hint="Смотрите на тренд: устойчивый рост — хорошо, падение 2+ периода — красный флаг." /></CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="period_start" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} />
                <Tooltip {...tooltipProps("bar")} />
                <Line type="monotone" dataKey="comfort_index" stroke="#D5A52A" strokeWidth={2} dot />
                <Line type="monotone" dataKey="tov_score" stroke="#8B6914" strokeWidth={1} dot={false} />
                <Line type="monotone" dataKey="kpi_score" stroke="#B8860B" strokeWidth={1} dot={false} />
                <Line type="monotone" dataKey="career_score" stroke="#DAA520" strokeWidth={1} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Профиль компании</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radar}>
                <PolarGrid stroke="#8884" />
                <PolarAngleAxis dataKey="k" tick={{ fontSize: 12 }} />
                <Radar dataKey="v" stroke="#D5A52A" fill="#D5A52A" fillOpacity={0.4} />
                <Tooltip {...tooltipProps("bar")} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Отделы</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {departments.length === 0 && <div className="p-6 text-sm text-muted-foreground">Отделы не рассчитаны.</div>}
            {departments.map((d) => (
              <Link key={d.scope_id ?? d.name} to={`/analytics/comfort/department/${d.scope_id}`}
                    className="flex items-center justify-between p-4 hover:bg-muted/40 transition">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-14 h-14 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-serif text-xl">
                    {d.comfort_index}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{d.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Тон {d.tov_score} · KPI {d.kpi_score} · Карьера {d.career_score}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={riskColor[d.risk_level]}>{riskLabel[d.risk_level]}</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {managers.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Руководители в зоне риска</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {managers.map((m) => (
                <Link key={m.manager_id} to={`/analytics/comfort/user/${m.manager_id}`}
                      className="flex items-center justify-between p-4 hover:bg-muted/40 transition">
                  <div>
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Подчинённых: {m.team_size} · В риске: {m.risky} · Средний индекс: {m.avg_index}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiTile({ label, value, trend, delta, risk, metricKey }: { label: string; value: number; trend?: string; delta?: number; risk?: string; metricKey?: MetricKey }) {
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">
          {metricKey ? <MetricLabel metricKey={metricKey} labelOverride={label} /> : label}
        </div>
        <div className="flex items-end justify-between mt-1">
          <div className="text-3xl font-serif">{value}</div>
          {trend && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Icon className="h-3 w-3" />{delta !== undefined ? (delta > 0 ? `+${delta}` : delta) : ""}
            </div>
          )}
        </div>
        {risk && <Badge variant="outline" className={`mt-2 ${riskColor[risk]}`}>{riskLabel[risk]}</Badge>}
      </CardContent>
    </Card>
  );
}

