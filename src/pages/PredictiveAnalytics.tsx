import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, BarChart3, Brain, Gauge, Loader2, RefreshCw, Save, Sparkles, TrendingDown, Users,
} from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePrimaryRole } from "@/hooks/useUserProfile";
import {
  BAND_LABELS, INDUSTRIES, LEVERS, METRIC_LABELS,
  predictiveApi,
  type PredictedEmployee, type RiskBand, type WhatIfResult,
} from "@/integrations/laravel/predictive";

const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`;

const bandTone: Record<RiskBand, string> = {
  high: "bg-destructive/15 text-destructive border-destructive/30",
  medium: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  low: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
};

const POSITION_LABEL: Record<string, string> = {
  top: "Топ-квартиль",
  above_median: "Выше медианы",
  below_median: "Ниже медианы",
  bottom: "Нижний квартиль",
};

export default function PredictiveAnalytics() {
  const role = usePrimaryRole();
  const allowed = role === "hr" || role === "hrd" || role === "company_admin" || role === "superadmin";
  const qc = useQueryClient();

  const [band, setBand] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [levers, setLevers] = useState<Record<string, number>>({});
  const [cost, setCost] = useState<string>("");
  const [whatIf, setWhatIf] = useState<WhatIfResult | null>(null);
  const [scenarioName, setScenarioName] = useState("");

  const overview = useQuery({ queryKey: ["pred-overview"], queryFn: predictiveApi.overview, enabled: allowed });
  const employees = useQuery({
    queryKey: ["pred-employees", band, search],
    queryFn: () => predictiveApi.employees({ band: band === "all" ? undefined : band, search: search || undefined }),
    enabled: allowed,
  });
  const drivers = useQuery({ queryKey: ["pred-drivers"], queryFn: () => predictiveApi.drivers(), enabled: allowed });
  const benchmarks = useQuery({ queryKey: ["pred-benchmarks"], queryFn: predictiveApi.benchmarks, enabled: allowed });
  const scenarios = useQuery({ queryKey: ["pred-scenarios"], queryFn: predictiveApi.listScenarios, enabled: allowed });
  const detail = useQuery({
    queryKey: ["pred-employee", selected],
    queryFn: () => predictiveApi.employee(selected as string),
    enabled: allowed && !!selected,
  });

  const recompute = useMutation({
    mutationFn: () => predictiveApi.recompute(180),
    onSuccess: (r) => {
      toast.success(`Прогноз пересчитан: ${r.updated} сотрудников`);
      ["pred-overview", "pred-employees", "pred-drivers", "pred-benchmarks"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveProfile = useMutation({
    mutationFn: (p: { industry?: string; replacement_cost?: number }) => predictiveApi.updateCompanyProfile(p),
    onSuccess: () => {
      toast.success("Настройки бенчмаркинга сохранены");
      qc.invalidateQueries({ queryKey: ["pred-benchmarks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runWhatIf = useMutation({
    mutationFn: () => predictiveApi.whatIf(levers, cost ? Number(cost) : undefined),
    onSuccess: (r) => {
      if (r.error === "no_predictions") {
        toast.error("Сначала пересчитайте прогноз");
        return;
      }
      setWhatIf(r);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveScenario = useMutation({
    mutationFn: () =>
      predictiveApi.saveScenario({
        name: scenarioName || "Сценарий удержания",
        params: levers,
        result: (whatIf ?? {}) as Record<string, unknown>,
      }),
    onSuccess: () => {
      toast.success("Сценарий сохранён");
      setScenarioName("");
      qc.invalidateQueries({ queryKey: ["pred-scenarios"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const driverChart = useMemo(
    () => (drivers.data?.drivers ?? []).slice(0, 9).map((d) => ({ name: d.label, value: d.share, feature: d.feature })),
    [drivers.data],
  );

  if (!allowed) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6 text-muted-foreground">Раздел доступен HR-ролям и администраторам компании.</CardContent></Card>
      </div>
    );
  }

  const o = overview.data;
  const metrics = o?.model_metrics;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" /> Предиктивная аналитика
          </h1>
          <p className="text-sm text-muted-foreground">
            Прогноз увольнений на 180 дней, драйверы текучести, отраслевые бенчмарки и сценарии «что если».
          </p>
        </div>
        <Button onClick={() => recompute.mutate()} disabled={recompute.isPending}>
          {recompute.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Пересчитать прогноз
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Под наблюдением</CardDescription></CardHeader>
          <CardContent className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />{o?.scored ?? 0} / {o?.headcount ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Ожидаемые уходы (180 дн.)</CardDescription></CardHeader>
          <CardContent className="text-2xl font-semibold flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-destructive" />{o?.expected_leavers ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Средняя вероятность</CardDescription></CardHeader>
          <CardContent className="text-2xl font-semibold flex items-center gap-2">
            <Gauge className="h-5 w-5 text-muted-foreground" />{pct(o?.avg_probability, 1)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Качество модели ({o?.model_version ?? "v1"})</CardDescription></CardHeader>
          <CardContent className="text-sm space-y-1">
            {metrics?.status === "ok" ? (
              <>
                <div>Accuracy: <b>{pct(metrics.accuracy, 1)}</b> · AUC: <b>{metrics.auc?.toFixed(2) ?? "—"}</b></div>
                <div className="text-muted-foreground">Precision {pct(metrics.precision_score, 0)} · Recall {pct(metrics.recall, 0)} · выборка {metrics.sample_size}</div>
              </>
            ) : (
              <span className="text-muted-foreground">
                Недостаточно исторических увольнений для валидации — прогноз строится на калиброванной модели рисков.
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="forecast">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="forecast"><Activity className="h-4 w-4 mr-2" />Прогноз</TabsTrigger>
          <TabsTrigger value="drivers"><Sparkles className="h-4 w-4 mr-2" />Драйверы (SHAP)</TabsTrigger>
          <TabsTrigger value="benchmarks"><BarChart3 className="h-4 w-4 mr-2" />Бенчмарки</TabsTrigger>
          <TabsTrigger value="whatif"><Gauge className="h-4 w-4 mr-2" />Что если</TabsTrigger>
        </TabsList>

        {/* --------- Прогноз --------- */}
        <TabsContent value="forecast" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["all", "high", "medium", "low"] as const).map((b) => (
              <Button key={b} size="sm" variant={band === b ? "default" : "outline"} onClick={() => setBand(b)}>
                {b === "all" ? "Все" : BAND_LABELS[b as RiskBand]}
                {o && b !== "all" ? ` · ${o.bands[b as RiskBand]}` : ""}
              </Button>
            ))}
            <Input
              className="max-w-xs"
              placeholder="Поиск по имени"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Сотрудники по риску ухода</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-[560px] overflow-auto">
                {employees.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
                {!employees.isLoading && !employees.data?.length && (
                  <p className="text-sm text-muted-foreground">Прогноз ещё не рассчитан — нажмите «Пересчитать прогноз».</p>
                )}
                {(employees.data ?? []).map((e: PredictedEmployee) => (
                  <button
                    key={e.user_id}
                    onClick={() => setSelected(e.user_id)}
                    className={`w-full text-left rounded-lg border p-3 transition hover:bg-muted/50 ${selected === e.user_id ? "border-primary" : "border-border"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{e.full_name ?? e.user_id}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[e.position, e.department].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={bandTone[e.band]}>{BAND_LABELS[e.band]}</Badge>
                        <span className="font-semibold tabular-nums">{pct(e.probability, 0)}</span>
                      </div>
                    </div>
                    <Progress value={e.probability * 100} className="h-1.5 mt-2" />
                    <div className="mt-2 flex flex-wrap gap-1">
                      {e.top_drivers.map((d) => (
                        <Badge key={d.feature} variant="secondary" className="text-[11px] font-normal">
                          {d.label} +{d.impact_pp.toFixed(1)} п.п.
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Разбор прогноза</CardTitle>
                <CardDescription>
                  {detail.data ? detail.data.full_name ?? detail.data.user_id : "Выберите сотрудника слева"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[560px] overflow-auto">
                {detail.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
                {detail.data && (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-semibold">{pct(detail.data.probability, 0)}</span>
                      <span className="text-sm text-muted-foreground">
                        риск ухода за {detail.data.horizon_days} дн. (база по компании {pct(detail.data.base_rate, 0)})
                      </span>
                    </div>
                    {detail.data.drivers.map((d) => (
                      <div key={d.feature} className="rounded-md border p-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>{d.label}</span>
                          <span className={d.shap >= 0 ? "text-destructive" : "text-emerald-600"}>
                            {d.impact_pp >= 0 ? "+" : ""}{d.impact_pp.toFixed(1)} п.п.
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Значение {(d.value * 100).toFixed(0)}% при среднем по когорте {(d.cohort_mean * 100).toFixed(0)}%
                        </div>
                        {d.shap > 0 && <div className="text-xs mt-1">{d.action}</div>}
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* --------- Драйверы --------- */}
        <TabsContent value="drivers" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Вклад драйверов в текучесть</CardTitle>
              <CardDescription>
                Аддитивная декомпозиция (SHAP) по {drivers.data?.sample ?? 0} сотрудникам: доля признака в общем объёме влияния.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[320px]">
              {driverChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={driverChart} layout="vertical" margin={{ left: 24, right: 24 }}>
                    <XAxis type="number" unit="%" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => [`${v}%`, "Доля влияния"]} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {driverChart.map((_, i) => (
                        <Cell key={i} fill="hsl(var(--primary))" fillOpacity={1 - i * 0.08} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground">Нет данных — пересчитайте прогноз.</p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            {(drivers.data?.drivers ?? []).map((d) => (
              <Card key={d.feature}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    {d.label}
                    <Badge variant="outline">{d.share}%</Badge>
                  </CardTitle>
                  <CardDescription>Затронуто сотрудников: {d.affected_employees}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{d.action}</CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* --------- Бенчмарки --------- */}
        <TabsContent value="benchmarks" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Настройки сравнения</CardTitle>
              <CardDescription>Отрасль и стоимость замены сотрудника используются в бенчмарках и сценариях.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label>Отрасль</Label>
                <Select
                  value={benchmarks.data?.company.industry ?? "all"}
                  onValueChange={(v) => saveProfile.mutate({ industry: v })}
                >
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Стоимость замены, ₽</Label>
                <Input
                  className="w-48"
                  type="number"
                  defaultValue={benchmarks.data?.company.replacement_cost ?? ""}
                  onBlur={(e) => e.target.value && saveProfile.mutate({ replacement_cost: Number(e.target.value) })}
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(benchmarks.data?.benchmarks ?? []).map((b) => (
              <Card key={b.metric}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{METRIC_LABELS[b.metric] ?? b.metric}</CardTitle>
                  <CardDescription>Отрасль: {benchmarks.data?.industry} · {b.period}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-semibold">
                      {b.company_value ?? "—"}<span className="text-sm font-normal text-muted-foreground"> {b.unit === "percent" ? "%" : b.unit === "days" ? "дн." : b.unit === "hours" ? "ч" : ""}</span>
                    </span>
                    {b.position && (
                      <Badge variant="outline" className={b.position === "top" || b.position === "above_median" ? bandTone.low : bandTone.medium}>
                        {POSITION_LABEL[b.position]}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    P25 {b.p25} · медиана {b.p50} · P75 {b.p75} · {b.lower_is_better ? "меньше — лучше" : "больше — лучше"}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* --------- Что если --------- */}
        <TabsContent value="whatif" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Рычаги удержания</CardTitle>
                <CardDescription>Насколько закроем проблему по каждому драйверу.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {LEVERS.map((l) => (
                  <div key={l.feature} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{l.label}</span>
                      <span className="tabular-nums text-muted-foreground">{Math.round((levers[l.feature] ?? 0) * 100)}%</span>
                    </div>
                    <Slider
                      value={[(levers[l.feature] ?? 0) * 100]}
                      max={100}
                      step={5}
                      onValueChange={([v]) => setLevers((p) => ({ ...p, [l.feature]: v / 100 }))}
                    />
                    <p className="text-xs text-muted-foreground">{l.hint}</p>
                  </div>
                ))}
                <div className="space-y-1">
                  <Label>Стоимость замены сотрудника, ₽ (необязательно)</Label>
                  <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="например 450000" />
                </div>
                <Button onClick={() => runWhatIf.mutate()} disabled={runWhatIf.isPending}>
                  {runWhatIf.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Gauge className="h-4 w-4 mr-2" />}
                  Рассчитать сценарий
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Результат</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {!whatIf && <p className="text-sm text-muted-foreground">Задайте рычаги и запустите расчёт.</p>}
                {whatIf && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Ожидаемые уходы</div>
                        <div className="text-xl font-semibold">
                          {whatIf.expected_leavers_before} → {whatIf.expected_leavers_after}
                        </div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Высокий риск</div>
                        <div className="text-xl font-semibold">
                          {whatIf.high_risk_before} → {whatIf.high_risk_after}
                        </div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Удержим сотрудников</div>
                        <div className="text-xl font-semibold text-emerald-600">{whatIf.retained_employees}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Экономия</div>
                        <div className="text-xl font-semibold">
                          {whatIf.money_saved ? `${whatIf.money_saved.toLocaleString("ru-RU")} ₽` : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Input placeholder="Название сценария" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
                      <Button variant="outline" onClick={() => saveScenario.mutate()} disabled={saveScenario.isPending}>
                        <Save className="h-4 w-4 mr-2" />Сохранить
                      </Button>
                    </div>
                  </>
                )}

                {!!scenarios.data?.length && (
                  <div className="pt-2 space-y-2">
                    <div className="text-sm font-medium">Сохранённые сценарии</div>
                    {scenarios.data.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                        <span className="truncate">{s.name}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await predictiveApi.deleteScenario(s.id);
                            qc.invalidateQueries({ queryKey: ["pred-scenarios"] });
                          }}
                        >
                          Удалить
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
