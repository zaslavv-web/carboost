/**
 * Performance / Probation / Disciplinary / 1:1 — REST helpers (Iteration 2).
 */
import { laravel } from "./client";

// ---- Performance ----
export interface PerformanceCycle {
  id: string;
  company_id: string;
  title: string;
  period_start: string;
  period_end: string;
  deadline?: string | null;
  status: "draft" | "open" | "closed";
  weights?: { self?: number; manager?: number; peer?: number } | null;
}

export interface PerformanceReviewFeedback {
  id: string;
  review_id: string;
  reviewer_id: string;
  role: "self" | "manager" | "peer" | "subordinate";
  competency_scores?: Record<string, number> | null;
  overall_score?: number | null;
  strengths?: string | null;
  improvements?: string | null;
  comments?: string | null;
  submitted_at?: string | null;
}

export interface PerformanceReview {
  id: string;
  cycle_id: string;
  user_id: string;
  manager_id?: string | null;
  status: "draft" | "self_done" | "manager_done" | "finalized";
  self_score?: number | null;
  manager_score?: number | null;
  peer_score?: number | null;
  final_score?: number | null;
  summary?: string | null;
  cycle?: PerformanceCycle;
  feedback?: PerformanceReviewFeedback[];
}

// ---- Probation ----
export interface ProbationCriterion {
  id: string;
  probation_id: string;
  title: string;
  description?: string | null;
  weight: number;
  is_met: boolean;
  met_at?: string | null;
  comment?: string | null;
}

export interface ProbationPeriod {
  id: string;
  user_id: string;
  company_id: string;
  manager_id?: string | null;
  hr_id?: string | null;
  start_date: string;
  end_date: string;
  extended_to?: string | null;
  status: "active" | "passed" | "extended" | "failed";
  decision_at?: string | null;
  decision_notes?: string | null;
  goals?: string | null;
  criteria?: ProbationCriterion[];
}

// ---- Disciplinary ----
export interface DisciplinaryCriterion {
  id: string;
  record_id: string;
  title: string;
  description?: string | null;
  is_met: boolean;
  met_at?: string | null;
  evidence_url?: string | null;
  comment?: string | null;
}

export interface DisciplinaryRecord {
  id: string;
  user_id: string;
  company_id: string;
  type: "warning" | "pip" | "observation";
  severity: "low" | "medium" | "high";
  status: "active" | "closed" | "escalated";
  reason: string;
  issued_at?: string | null;
  valid_until?: string | null;
  closed_at?: string | null;
  closure_reason?: string | null;
  criteria?: DisciplinaryCriterion[];
}

// ---- 1:1 ----
export interface OneOnOneMeeting {
  id: string;
  manager_id: string;
  employee_id: string;
  scheduled_at: string;
  duration_min: number;
  status: "scheduled" | "done" | "cancelled";
  agenda?: string | null;
  notes?: string | null;
  related_type?: string | null;
  related_id?: string | null;
}

interface Paginated<T> { data: T[]; total: number; current_page: number; last_page: number; }
const unwrap = <T,>(r: Paginated<T> | T[] | null | undefined): T[] => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  return (r as Paginated<T>).data ?? [];
};
const must = async <T,>(p: Promise<{ data: T | null; error: any }>): Promise<T> => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};

export const performanceApi = {
  listCycles: async () => unwrap(await must(laravel.get<Paginated<PerformanceCycle>>("/performance-cycles"))),
  createCycle: (p: Partial<PerformanceCycle>) => laravel.post<PerformanceCycle>("/performance-cycles", p),
  updateCycle: (id: string, p: Partial<PerformanceCycle>) => laravel.patch<PerformanceCycle>(`/performance-cycles/${id}`, p),
  openCycle: (id: string) => laravel.post(`/performance-cycles/${id}/open`),
  closeCycle: (id: string) => laravel.post(`/performance-cycles/${id}/close`),
  listReviews: async (scope: "mine" | "team" | "all" = "mine", cycleId?: string) => {
    const qs = new URLSearchParams({ scope });
    if (cycleId) qs.set("cycle_id", cycleId);
    return unwrap(await must(laravel.get<Paginated<PerformanceReview>>(`/performance-reviews?${qs.toString()}`)));
  },
  getReview: (id: string) => laravel.get<PerformanceReview>(`/performance-reviews/${id}`),
  submitFeedback: (reviewId: string, payload: Partial<PerformanceReviewFeedback> & { role: string }) =>
    laravel.post(`/performance-reviews/${reviewId}/feedback`, payload),
  finalize: (id: string, summary?: string) =>
    laravel.post<PerformanceReview>(`/performance-reviews/${id}/finalize`, { summary }),
};

export const probationApi = {
  list: async (scope: "mine" | "team" | "all" = "mine", status?: string) => {
    const qs = new URLSearchParams({ scope });
    if (status) qs.set("status", status);
    return unwrap(await must(laravel.get<Paginated<ProbationPeriod>>(`/probations?${qs.toString()}`)));
  },
  get: (id: string) => laravel.get<ProbationPeriod>(`/probations/${id}`),
  create: (p: any) => laravel.post<ProbationPeriod>("/probations", p),
  update: (id: string, p: any) => laravel.patch<ProbationPeriod>(`/probations/${id}`, p),
  decide: (id: string, p: { decision: "passed" | "extended" | "failed"; extended_to?: string; decision_notes?: string }) =>
    laravel.post<ProbationPeriod>(`/probations/${id}/decide`, p),
  addCriterion: (id: string, p: { title: string; description?: string; weight?: number }) =>
    laravel.post<ProbationCriterion>(`/probations/${id}/criteria`, p),
  toggleCriterion: (id: string, criterionId: string, comment?: string) =>
    laravel.post<ProbationCriterion>(`/probations/${id}/criteria/${criterionId}/toggle`, { comment }),
  deleteCriterion: (id: string, criterionId: string) => laravel.delete(`/probations/${id}/criteria/${criterionId}`),
};

export const disciplinaryApi = {
  list: async (scope: "mine" | "team" | "all" = "mine", type?: string, status?: string) => {
    const qs = new URLSearchParams({ scope });
    if (type) qs.set("type", type);
    if (status) qs.set("status", status);
    return unwrap(await must(laravel.get<Paginated<DisciplinaryRecord>>(`/disciplinary-records?${qs.toString()}`)));
  },
  get: (id: string) => laravel.get<DisciplinaryRecord>(`/disciplinary-records/${id}`),
  create: (p: any) => laravel.post<DisciplinaryRecord>("/disciplinary-records", p),
  close: (id: string, p: { closure_reason: string; status?: "closed" | "escalated" }) =>
    laravel.post<DisciplinaryRecord>(`/disciplinary-records/${id}/close`, p),
  addCriterion: (id: string, p: { title: string; description?: string }) =>
    laravel.post<DisciplinaryCriterion>(`/disciplinary-records/${id}/criteria`, p),
  toggleCriterion: (id: string, criterionId: string, p?: { comment?: string; evidence_url?: string }) =>
    laravel.post<DisciplinaryCriterion>(`/disciplinary-records/${id}/criteria/${criterionId}/toggle`, p || {}),
  deleteCriterion: (id: string, criterionId: string) => laravel.delete(`/disciplinary-records/${id}/criteria/${criterionId}`),
};

export const oneOnOneApi = {
  list: async (scope: "mine" | "managing" | "all" = "mine", filters?: { employee_id?: string; related_type?: string; related_id?: string }) => {
    const qs = new URLSearchParams({ scope });
    Object.entries(filters || {}).forEach(([k, v]) => { if (v) qs.set(k, v); });
    return unwrap(await must(laravel.get<Paginated<OneOnOneMeeting>>(`/one-on-ones?${qs.toString()}`)));
  },
  create: (p: any) => laravel.post<OneOnOneMeeting>("/one-on-ones", p),
  update: (id: string, p: any) => laravel.patch<OneOnOneMeeting>(`/one-on-ones/${id}`, p),
  delete: (id: string) => laravel.delete(`/one-on-ones/${id}`),
};
