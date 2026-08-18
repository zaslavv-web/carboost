/**
 * Epic B2 — КЭДО: шаблоны, маршруты, документы, подписание (ПЭП/УКЭП),
 * журнал целостности (hash chain) и каркас ГИС ЭДО.
 */
import { laravel } from "./client";

export type KedoSignatureKind = "pep" | "ukep" | "any";
export type KedoDocStatus = "draft" | "in_review" | "signed" | "rejected" | "cancelled";
export type KedoAction = "approve" | "sign" | "acknowledge";
export type KedoActorType = "user" | "role" | "manager" | "subject";
export type KedoScopeType = "user" | "department" | "position" | "company";

export interface KedoTemplate {
  id: string;
  company_id: string | null;
  code: string;
  title: string;
  category: string;
  body_html?: string | null;
  requires_signature: boolean | number;
  signature_kind: KedoSignatureKind;
  route_id?: string | null;
  retention_years: number;
  is_system: boolean | number;
  is_active: boolean | number;
  updated_at?: string;
}

export interface KedoRouteStep {
  id?: string;
  step_order?: number;
  title?: string | null;
  actor_type: KedoActorType;
  actor_ref?: string | null;
  action: KedoAction;
  due_days?: number;
}

export interface KedoRoute {
  id: string;
  title: string;
  description?: string | null;
  is_active: boolean | number;
  steps: KedoRouteStep[];
}

export interface KedoDocument {
  id: string;
  template_id?: string | null;
  route_id?: string | null;
  user_id: string;
  employee_name?: string | null;
  number?: string | null;
  title: string;
  category: string;
  body_html?: string | null;
  status: KedoDocStatus;
  current_step: number;
  signature_kind: KedoSignatureKind;
  retention_until?: string | null;
  created_at?: string;
  completed_at?: string | null;
  my_action?: KedoAction | null;
  my_step?: number | null;
  action_required?: boolean;
}

export interface KedoParticipant {
  id: string;
  user_id: string;
  name?: string | null;
  step_order: number;
  action: KedoAction;
  status: "pending" | "done" | "rejected" | "skipped";
  due_date?: string | null;
  acted_at?: string | null;
  comment?: string | null;
}

export interface KedoSignature {
  id: string;
  user_id: string;
  name?: string | null;
  kind: "pep" | "ukep";
  cert_subject?: string | null;
  cert_serial?: string | null;
  provider?: string | null;
  ip?: string | null;
  doc_hash?: string | null;
  signed_at?: string | null;
}

export interface KedoEvent {
  id: string;
  event: string;
  actor_id?: string | null;
  actor_name?: string | null;
  payload?: string | null;
  prev_hash?: string | null;
  hash: string;
  created_at?: string | null;
}

export interface KedoEdoConnection {
  id: string;
  provider: "sfr" | "fns" | "diadoc" | "nobel";
  title: string;
  endpoint?: string | null;
  login?: string | null;
  is_active: boolean | number;
  last_check_at?: string | null;
  last_status?: string | null;
}

export interface KedoDispatch {
  id: string;
  title?: string | null;
  status: string;
  message?: string | null;
  created_at?: string | null;
  sent_at?: string | null;
}

export const kedo = {
  stats: () =>
    laravel.get<{
      by_status: Record<string, number>;
      total: number;
      templates: number;
      routes: number;
    }>("/kedo/stats"),

  // Templates
  listTemplates: () => laravel.get<{ data: KedoTemplate[] }>("/kedo/templates"),
  getTemplate: (id: string) => laravel.get<KedoTemplate>(`/kedo/templates/${id}`),
  createTemplate: (body: Partial<KedoTemplate>) =>
    laravel.post<KedoTemplate>("/kedo/templates", body),
  updateTemplate: (id: string, body: Partial<KedoTemplate>) =>
    laravel.patch<KedoTemplate>(`/kedo/templates/${id}`, body),
  deleteTemplate: (id: string) => laravel.delete(`/kedo/templates/${id}`),

  // Routes
  listRoutes: () => laravel.get<{ data: KedoRoute[] }>("/kedo/routes"),
  createRoute: (body: { title: string; description?: string | null; steps: KedoRouteStep[] }) =>
    laravel.post<{ ok: boolean; id: string }>("/kedo/routes", body),
  updateRoute: (
    id: string,
    body: { title?: string; description?: string | null; is_active?: boolean; steps?: KedoRouteStep[] },
  ) => laravel.patch<{ ok: boolean }>(`/kedo/routes/${id}`, body),
  deleteRoute: (id: string) => laravel.delete(`/kedo/routes/${id}`),

  // Documents
  listDocuments: (params?: { status?: string; user_id?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.user_id) qs.set("user_id", params.user_id);
    if (params?.search) qs.set("search", params.search);
    const s = qs.toString();
    return laravel.get<{ data: KedoDocument[] }>(`/kedo/documents${s ? `?${s}` : ""}`);
  },
  myDocuments: () => laravel.get<{ data: KedoDocument[] }>("/kedo/my-documents"),
  getDocument: (id: string) =>
    laravel.get<{
      document: KedoDocument;
      participants: KedoParticipant[];
      signatures: KedoSignature[];
      my_task: KedoParticipant | null;
    }>(`/kedo/documents/${id}`),
  bulkCreate: (body: {
    template_id: string;
    scope_type: KedoScopeType;
    user_ids?: string[];
    scope_ref?: string | null;
    route_id?: string | null;
    send?: boolean;
  }) => laravel.post<{ ok: boolean; created: number }>("/kedo/documents/bulk", body),
  send: (id: string) => laravel.post<{ ok: boolean }>(`/kedo/documents/${id}/send`),
  cancel: (id: string, reason?: string) =>
    laravel.post<{ ok: boolean }>(`/kedo/documents/${id}/cancel`, { reason }),

  // Signing
  requestOtp: (id: string) =>
    laravel.post<{ ok: boolean; code: string; expires_in: number }>(`/kedo/documents/${id}/otp`),
  signPep: (id: string, code: string) =>
    laravel.post<{ ok: boolean }>(`/kedo/documents/${id}/sign-pep`, { code }),
  signUkep: (
    id: string,
    file: File,
    meta?: { cert_subject?: string; cert_serial?: string; cert_valid_to?: string; provider?: string },
  ) => {
    const fd = new FormData();
    fd.append("signature", file);
    Object.entries(meta ?? {}).forEach(([k, v]) => v && fd.append(k, v));
    return laravel.post<{ ok: boolean }>(`/kedo/documents/${id}/sign-ukep`, fd);
  },
  approve: (id: string, comment?: string) =>
    laravel.post<{ ok: boolean }>(`/kedo/documents/${id}/approve`, { comment }),
  acknowledge: (id: string) => laravel.post<{ ok: boolean }>(`/kedo/documents/${id}/acknowledge`),
  reject: (id: string, reason: string) =>
    laravel.post<{ ok: boolean }>(`/kedo/documents/${id}/reject`, { reason }),

  // Journal
  events: (id: string) => laravel.get<{ data: KedoEvent[] }>(`/kedo/documents/${id}/events`),
  verify: (id: string) =>
    laravel.get<{
      ok: boolean;
      events: number;
      broken_event_id: string | null;
      head_hash: string | null;
      retention_until: string | null;
    }>(`/kedo/documents/${id}/verify`),

  // ГИС ЭДО
  listEdoConnections: () => laravel.get<{ data: KedoEdoConnection[] }>("/kedo/edo/connections"),
  createEdoConnection: (body: Partial<KedoEdoConnection> & { secret?: string }) =>
    laravel.post<{ ok: boolean; id: string }>("/kedo/edo/connections", body),
  deleteEdoConnection: (id: string) => laravel.delete(`/kedo/edo/connections/${id}`),
  dispatchToEdo: (connectionId: string, documentIds: string[]) =>
    laravel.post<{ ok: boolean; queued: number }>("/kedo/edo/dispatch", {
      connection_id: connectionId,
      document_ids: documentIds,
    }),
  listDispatches: () => laravel.get<{ data: KedoDispatch[] }>("/kedo/edo/dispatches"),
};

export const KEDO_CATEGORY_LABELS: Record<string, string> = {
  hiring: "Приём и оформление",
  transfer: "Переводы",
  dismissal: "Увольнение",
  leave: "Отпуска",
  trip: "Командировки",
  time: "Режим работы",
  payroll: "Оплата труда",
  policy: "Политики и ЛНА",
  discipline: "Дисциплина",
  other: "Прочее",
};

export const KEDO_STATUS_LABELS: Record<KedoDocStatus, string> = {
  draft: "Черновик",
  in_review: "На подписании",
  signed: "Подписан",
  rejected: "Отклонён",
  cancelled: "Аннулирован",
};

export const KEDO_ACTION_LABELS: Record<KedoAction, string> = {
  approve: "Согласование",
  sign: "Подписание",
  acknowledge: "Ознакомление",
};

export const KEDO_ACTOR_LABELS: Record<KedoActorType, string> = {
  subject: "Сотрудник (субъект документа)",
  user: "Конкретный сотрудник",
  manager: "Руководитель сотрудника",
  role: "Роль",
};
