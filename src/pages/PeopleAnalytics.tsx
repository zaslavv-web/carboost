/**
 * Волна 6: People Analytics — расширенная HR-аналитика.
 *
 * Читает агрегированные показатели из /api/people-analytics/*:
 *  - Численность по департаментам/позициям
 *  - Стажевые когорты (tenure buckets)
 *  - Динамика найма за 12 мес
 *  - Отсутствия по месяцам (approved days)
 *  - Распределение по риск-баллу (если модуль подключён)
 *
 * Доступ — HRD/company_admin/superadmin (гейт на бэке).
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { laravel } from "@/integrations/laravel/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, TrendingUp, CalendarDays, AlertTriangle, Building2 } from "lucide-react";
import { MetricLabel } from "@/components/metrics/MetricLabel";
import { ChartExplainer } from "@/components/metrics/ChartExplainer";
import type { MetricKey } from "@/lib/metricsCatalog";

import { tooltipProps } from "@/lib/chartTooltip";

type Bucket = { label: string; value: number };
type MonthPoint = { month: string; value: number };
type AbsencePoint = { month: string; days: number; requests: number; rate: number };

const COLORS = ["#D5A52A", "#B8860B", "#8B6914", "#DAA520", "#6B4E11"];

export default function PeopleAnalytics() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [headcount, setHeadcount] = useState<{ total: number; by_department: Bucket[]; by_position: Bucket[] } | null>(null);
  const [tenure, setTenure] = useState<Bucket[]>([]);
  const [hiring, setHiring] = useState<MonthPoint[]>([]);
  const [absence, setAbsence] = useState<AbsencePoint[]>([]);
  const [risk, setRisk] = useState<Bucket[]>([]);
  const activeSlice = searchParams.get("slice");
  const openEmployees = (params: Record<string, string>) => {
    const query = new URLSearchParams(params);
    navigate(`/users?${query.toString()}`);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [h, t, hi, a, r] = await Promise.all([
        laravel.get<any>("/people-analytics/headcount"),
        laravel.get<any>("/people-analytics/tenure"),
        laravel.get<any>("/people-analytics/hiring"),
        laravel.get<any>("/people-analytics/absence"),
        laravel.get<any>("/people-analytics/risk"),
      ]);
      if (cancelled) return;
      setHeadcount(h.data ?? null);
      setTenure(t.data?.buckets ?? []);
      setHiring(hi.data?.series ?? []);
      setAbsence(a.data?.series ?? []);
      setRisk(r.data?.buckets ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-3xl font-serif">People Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Сводная HR-аналитика по компании: численность, стажевые когорты, найм, отсутствия и риски.
        </p>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard metricKey="headcount_delta" icon={Users} label="Всего сотрудников" value={headcount?.total ?? 0} onClick={() => navigate("/users")} />
        <KpiCard
          icon={Building2}
          label="Департаментов"
          value={headcount?.by_department.filter((d) => d.label !== "Без департамента").length ?? 0}
          onClick={() => navigate("/employee-map")}
        />
        <KpiCard
          metricKey="hiring_funnel_conversion"
          icon={TrendingUp}
          label="Нанято за 12 мес"
          value={hiring.reduce((s, x) => s + x.value, 0)}
          onClick={() => navigate("/people-analytics?slice=hiring")}
        />
        <KpiCard
          metricKey="risk_index"
          icon={AlertTriangle}
          label="В зоне высокого риска"
          value={risk.filter((b) => b.label === "Высокий" || b.label === "Критический").reduce((s, x) => s + x.value, 0)}
          onClick={() => navigate("/risk-analytics?level=high")}
        />

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className={activeSlice === "headcount" ? "ring-2 ring-primary" : undefined}>
          <CardHeader><CardTitle className="text-base">Численность по департаментам</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={headcount?.by_department ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} />
                <Tooltip {...tooltipProps("bar")} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(row: Bucket) => openEmployees({ department: row.label })} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Стажевые когорты</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={tenure} dataKey="value" nameKey="label" outerRadius={100} label cursor="pointer" onClick={(row: Bucket) => openEmployees({ tenure: row.label })}>
                  {tenure.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                </Pie>
                <Legend />
                <Tooltip {...tooltipProps("bar")} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className={activeSlice === "hiring" ? "ring-2 ring-primary" : undefined}>
          <CardHeader><CardTitle className="text-base"><ChartExplainer metricKey="hiring_funnel_conversion" hint="Пики — активные волны найма; спад — заморозка вакансий." /></CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={hiring}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip {...tooltipProps("bar")} />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ cursor: "pointer", r: 4 }} activeDot={{ onClick: (_event, payload: any) => openEmployees({ hiredMonth: payload.payload.month }), cursor: "pointer", r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base"><ChartExplainer metricKey="absence_rate" hint="Рост — сигнал нагрузки или сезонности; смотрите разбивку по отделам." /></CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={absence}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip {...tooltipProps("bar")} />
                <Bar dataKey="rate" name="Доля отсутствий, %" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(row: AbsencePoint) => navigate(`/leaves?month=${encodeURIComponent(row.month)}&status=approved`)} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Топ-15 позиций</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={headcount?.by_position ?? []} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={160} />
                <Tooltip {...tooltipProps("bar")} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(row: Bucket) => openEmployees({ position: row.label })} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {risk.some((b) => b.value > 0) && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base"><ChartExplainer metricKey="risk_index" hint="Красная и жёлтая зоны требуют HR-действий в первую очередь." /></CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                {risk.map((b) => (
                  <button key={b.label} type="button" onClick={() => navigate(`/risk-analytics?level=${b.label === "Низкий" ? "low" : b.label === "Средний" ? "medium" : "high"}`)} className="p-4 rounded-lg border bg-card text-left transition-colors hover:bg-accent">
                    <div className="text-xs text-muted-foreground">{b.label}</div>
                    <div className="text-2xl font-serif mt-1">{b.value}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, metricKey, onClick }: { icon: any; label: string; value: number; metricKey?: MetricKey; onClick?: () => void }) {
  return (
    <Card className={onClick ? "cursor-pointer transition-colors hover:bg-accent" : undefined} onClick={onClick}>
      <CardContent className="p-4 flex items-center gap-3" role={onClick ? "link" : undefined}>
        <div className="p-2 rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">
            {metricKey ? <MetricLabel metricKey={metricKey} labelOverride={label} /> : label}
          </div>
          <div className="text-2xl font-serif">{value}</div>
        </div>
      </CardContent>

    </Card>
  );
}
