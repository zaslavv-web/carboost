/**
 * Epic D1 — Talent Review: 9-box / 12-box, сессии калибровки,
 * карта преемственности и кадровый резерв.
 */
import { laravel } from "./client";

export type GridType = "9box" | "12box";
export type SessionStatus = "draft" | "in_progress" | "completed";
export type Readiness = "ready_now" | "1_2_years" | "3_plus";
export type RiskLevel = "low" | "medium" | "high";
export type PoolKind = "hipo" | "successor" | "key_talent" | "risk";

export interface TalentReviewSession {
  id: string;
  company_id: string;
  title: string;
  grid_type: GridType;
  status: SessionStatus;
  cycle_id?: string | null;
  department?: string | null;
  facilitator_id?: string | null;
  scheduled_at?: string | null;
  completed_at?: string | null;
  protocol?: string | null;
  rated_count?: number;
  created_at?: string;
}

export interface GridRow {
  user_id: string;
  full_name: string | null;
  position: string | null;
  department: string | null;
  avatar_url: string | null;
  performance_score: number | null;
  perf_level: number;
  pot_level: number;
  box: number;
  agreed: boolean;
  flight_risk: RiskLevel | null;
  note: string | null;
  calibrated: boolean;
}

export interface GridResponse {
  session: TalentReviewSession;
  cols: number;
  rows: GridRow[];
}

export interface TalentReviewNote {
  id: string;
  session_id: string;
  subject_id?: string | null;
  subject_name?: string | null;
  kind: "note" | "decision" | "action";
  body: string;
  assignee_id?: string | null;
  due_date?: string | null;
  created_at?: string;
}

export interface SuccessionCandidate {
  id: string;
  plan_id: string;
  user_id: string;
  readiness: Readiness;
  rank: number;
  note?: string | null;
  full_name?: string | null;
  position?: string | null;
  avatar_url?: string | null;
}

export interface SuccessionPlan {
  id: string;
  position_id?: string | null;
  position_title: string;
  incumbent_id?: string | null;
  incumbent_name?: string | null;
  criticality: RiskLevel;
  risk_of_loss: RiskLevel;
  note?: string | null;
  candidates: SuccessionCandidate[];
}

export interface TalentPoolMember {
  id: string;
  user_id: string;
  pool: PoolKind;
  source: "manual" | "auto";
  box?: number | null;
  note?: string | null;
  full_name?: string | null;
  position?: string | null;
  department?: string | null;
  avatar_url?: string | null;
}

const must = async <T,>(p: Promise<{ data: T | null; error: any }>): Promise<T> => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};
const list = async <T,>(p: Promise<{ data: { data?: T[] } | null; error: any }>): Promise<T[]> =>
  (await must(p))?.data ?? [];

export const talentReviewApi = {
  listSessions: () => list<TalentReviewSession>(laravel.get("/talent-review/sessions")),
  createSession: (p: Partial<TalentReviewSession>) =>
    must(laravel.post<TalentReviewSession>("/talent-review/sessions", p)),
  updateSession: (id: string, p: Partial<TalentReviewSession>) =>
    must(laravel.patch<TalentReviewSession>(`/talent-review/sessions/${id}`, p)),
  deleteSession: (id: string) => must(laravel.delete(`/talent-review/sessions/${id}`)),

  grid: (id: string) => must(laravel.get<GridResponse>(`/talent-review/sessions/${id}/grid`)),
  saveRatings: (
    id: string,
    ratings: Array<{
      user_id: string;
      perf_level: number;
      pot_level: number;
      performance_score?: number | null;
      flight_risk?: RiskLevel | null;
      agreed?: boolean;
      note?: string | null;
    }>,
  ) => must(laravel.post(`/talent-review/sessions/${id}/ratings`, { ratings })),

  listNotes: (id: string) => list<TalentReviewNote>(laravel.get(`/talent-review/sessions/${id}/notes`)),
  createNote: (id: string, p: Partial<TalentReviewNote>) =>
    must(laravel.post<TalentReviewNote>(`/talent-review/sessions/${id}/notes`, p)),
  deleteNote: (id: string, noteId: string) =>
    must(laravel.delete(`/talent-review/sessions/${id}/notes/${noteId}`)),

  buildPool: (id: string) =>
    must(laravel.post<{ ok: boolean; added: number }>(`/talent-review/sessions/${id}/build-pool`, {})),

  listPool: () => list<TalentPoolMember>(laravel.get("/talent-pool")),
  addPoolMember: (p: { user_id: string; pool?: PoolKind; note?: string }) =>
    must(laravel.post<TalentPoolMember>("/talent-pool", p)),
  removePoolMember: (id: string) => must(laravel.delete(`/talent-pool/${id}`)),

  listPlans: () => list<SuccessionPlan>(laravel.get("/succession-plans")),
  createPlan: (p: Partial<SuccessionPlan>) => must(laravel.post<SuccessionPlan>("/succession-plans", p)),
  updatePlan: (id: string, p: Partial<SuccessionPlan>) =>
    must(laravel.patch<SuccessionPlan>(`/succession-plans/${id}`, p)),
  deletePlan: (id: string) => must(laravel.delete(`/succession-plans/${id}`)),
  addCandidate: (planId: string, p: { user_id: string; readiness?: Readiness; note?: string }) =>
    must(laravel.post<SuccessionCandidate>(`/succession-plans/${planId}/candidates`, p)),
  removeCandidate: (planId: string, candidateId: string) =>
    must(laravel.delete(`/succession-plans/${planId}/candidates/${candidateId}`)),
};

/** Подписи боксов 9-box (индексы 1..9, снизу-вверх по потенциалу). */
export const BOX_LABELS_9: Record<number, string> = {
  1: "Риск / несоответствие",
  2: "Крепкий исполнитель",
  3: "Надёжный профессионал",
  4: "Требует развития",
  5: "Ядро команды",
  6: "Высокая результативность",
  7: "Загадка (потенциал)",
  8: "Растущая звезда",
  9: "Звезда / преемник",
};

export const BOX_LABELS_12: Record<number, string> = {
  1: "Риск",
  2: "Ниже ожиданий",
  3: "Соответствует",
  4: "Стабильно сильный",
  5: "Требует развития",
  6: "Ядро команды",
  7: "Сильный игрок",
  8: "Эксперт",
  9: "Загадка",
  10: "Перспективный",
  11: "Растущая звезда",
  12: "Звезда / преемник",
};

export const PERF_LABELS = ["Ниже ожиданий", "Соответствует", "Превышает", "Выдающийся"];
export const POT_LABELS = ["Низкий потенциал", "Средний потенциал", "Высокий потенциал"];

export const READINESS_LABELS: Record<Readiness, string> = {
  ready_now: "Готов сейчас",
  "1_2_years": "1–2 года",
  "3_plus": "3+ года",
};

export const POOL_LABELS: Record<PoolKind, string> = {
  hipo: "HiPo",
  successor: "Преемники",
  key_talent: "Ключевые таланты",
  risk: "Риск удержания",
};
