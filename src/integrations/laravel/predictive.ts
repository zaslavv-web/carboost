/**
 * Epic D3 — предиктивная аналитика: прогноз увольнений, SHAP-драйверы,
 * отраслевые бенчмарки и калькулятор сценариев «что если».
 */
import { laravel } from "./client";

export type RiskBand = "low" | "medium" | "high";

export interface Driver {
  feature: string;
  label: string;
  value: number;
  cohort_mean: number;
  shap: number;
  impact_pp: number;
  action: string;
}

export interface ModelMetrics {
  accuracy: number | null;
  precision_score: number | null;
  recall: number | null;
  auc: number | null;
  sample_size: number;
  positives: number;
  status: "ok" | "insufficient_data";
  evaluated_at?: string | null;
}

export interface PredictiveOverview {
  headcount: number;
  scored: number;
  avg_probability: number;
  base_rate: number;
  expected_leavers: number;
  bands: { high: number; medium: number; low: number };
  computed_at?: string | null;
  model_version: string;
  model_metrics: ModelMetrics | null;
}

export interface PredictedEmployee {
  user_id: string;
  full_name: string | null;
  position: string | null;
  department: string | null;
  avatar_url: string | null;
  probability: number;
  band: RiskBand;
  top_drivers: Driver[];
  computed_at?: string | null;
}

export interface EmployeePrediction extends Omit<PredictedEmployee, "top_drivers"> {
  base_rate: number;
  horizon_days: number;
  features: Record<string, number>;
  drivers: Driver[];
}

export interface AggregateDriver {
  feature: string;
  label: string;
  action: string;
  mean_abs_shap: number;
  direction: "increases" | "decreases";
  share: number;
  affected_employees: number;
}

export interface BenchmarkItem {
  metric: string;
  unit: string;
  p25: number;
  p50: number;
  p75: number;
  lower_is_better: boolean;
  company_value: number | null;
  position: "top" | "above_median" | "below_median" | "bottom" | null;
  source: string | null;
  period: string | null;
}

export interface BenchmarksResponse {
  industry: string;
  company: { industry: string | null; headcount_band: string | null; replacement_cost: number | null };
  benchmarks: BenchmarkItem[];
}

export interface WhatIfResult {
  headcount: number;
  avg_probability_before: number;
  avg_probability_after: number;
  expected_leavers_before: number;
  expected_leavers_after: number;
  retained_employees: number;
  high_risk_before: number;
  high_risk_after: number;
  high_risk_recovered: number;
  money_saved: number | null;
  levers: Record<string, number>;
  error?: string;
}

export interface WhatIfScenario {
  id: string;
  name: string;
  description?: string | null;
  params: string | Record<string, unknown>;
  result: string | Record<string, unknown>;
  created_at?: string;
}

const must = async <T,>(p: Promise<{ data: T | null; error: any }>): Promise<T> => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};

export const BAND_LABELS: Record<RiskBand, string> = {
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
};

export const METRIC_LABELS: Record<string, string> = {
  turnover_rate: "Текучесть (год)",
  voluntary_turnover: "Добровольная текучесть",
  engagement: "Вовлечённость",
  absenteeism: "Абсентеизм",
  time_to_hire: "Срок закрытия вакансии",
  training_hours: "Часы обучения на сотрудника",
  internal_fill_rate: "Доля внутренних назначений",
};

export const INDUSTRIES: Array<{ value: string; label: string }> = [
  { value: "it", label: "IT и телеком" },
  { value: "retail", label: "Ритейл" },
  { value: "manufacturing", label: "Производство" },
  { value: "finance", label: "Финансы" },
  { value: "healthcare", label: "Медицина" },
  { value: "all", label: "Кросс-отраслевой" },
];

export const LEVERS: Array<{ feature: string; label: string; hint: string }> = [
  { feature: "no_recent_1on1", label: "Регулярные 1:1", hint: "Доля закрытых пробелов по встречам 1:1" },
  { feature: "career_stagnation", label: "Движение по карьере", hint: "Обновление ИПР и карьерных треков" },
  { feature: "recognition_gap", label: "Признание коллег", hint: "Охват программой peer-признания" },
  { feature: "overdue_tasks", label: "Просроченные задачи", hint: "Разбор просрочек в трекере" },
  { feature: "overdue_courses", label: "Обучение в срок", hint: "Закрытие просроченных обязательных курсов" },
  { feature: "workload", label: "Нагрузка", hint: "Перераспределение задач в командах" },
];

export const predictiveApi = {
  overview: () => must(laravel.get<PredictiveOverview>("/predictive/overview")),
  recompute: (horizonDays = 180) =>
    must(laravel.post<{ updated: number; base_rate: number; metrics: ModelMetrics }>("/predictive/recompute", { horizon_days: horizonDays })),
  employees: (params: { band?: string; department?: string; search?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => !!v) as [string, string][]).toString();
    return must(laravel.get<{ data: PredictedEmployee[] }>(`/predictive/employees${qs ? `?${qs}` : ""}`)).then((r) => r?.data ?? []);
  },
  employee: (userId: string) => must(laravel.get<EmployeePrediction>(`/predictive/employees/${userId}`)),
  drivers: (department?: string) =>
    must(laravel.get<{ sample: number; drivers: AggregateDriver[] }>(`/predictive/drivers${department ? `?department=${encodeURIComponent(department)}` : ""}`)),
  benchmarks: () => must(laravel.get<BenchmarksResponse>("/predictive/benchmarks")),
  updateCompanyProfile: (p: { industry?: string; headcount_band?: string; replacement_cost?: number }) =>
    must(laravel.patch("/predictive/company-profile", p)),
  whatIf: (levers: Record<string, number>, replacementCost?: number) =>
    must(laravel.post<WhatIfResult>("/predictive/what-if", { levers, replacement_cost: replacementCost })),
  listScenarios: () => must(laravel.get<WhatIfScenario[]>("/predictive/scenarios")),
  saveScenario: (p: { name: string; description?: string; params: Record<string, unknown>; result?: Record<string, unknown> }) =>
    must(laravel.post<{ id: string }>("/predictive/scenarios", p)),
  deleteScenario: (id: string) => must(laravel.delete(`/predictive/scenarios/${id}`)),
};
