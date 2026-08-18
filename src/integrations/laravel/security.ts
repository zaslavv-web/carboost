/**
 * Epic B3 — SSO, SCIM, 2FA, аудит безопасности и кастомные RBAC-роли.
 */
import { laravel } from "./client";

export type SsoKind = "saml" | "oidc";
export type AuditSeverity = "info" | "warning" | "critical";

export interface SsoProvider {
  id: string;
  kind: SsoKind;
  title: string;
  domain_hint?: string | null;
  is_active: boolean | number;
  jit_provisioning: boolean | number;
  default_role: string;
  entity_id?: string | null;
  sso_url?: string | null;
  slo_url?: string | null;
  x509_cert?: string | null;
  issuer?: string | null;
  authorize_url?: string | null;
  token_url?: string | null;
  userinfo_url?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  scopes?: string | null;
  last_login_at?: string | null;
}

export interface ScimToken {
  id: string;
  name: string;
  token_prefix: string;
  is_active: boolean | number;
  last_used_at?: string | null;
  created_at?: string | null;
}

export interface SecurityPolicy {
  require_2fa_roles: string[];
  ip_allowlist: string[];
  session_timeout_minutes: number;
  password_min_length: number;
  sso_only: boolean;
  siem_webhook_url?: string | null;
  siem_format: "json" | "cef";
}

export interface AuditEvent {
  id: string;
  user_id?: string | null;
  actor_email?: string | null;
  event: string;
  category: string;
  severity: AuditSeverity;
  target_type?: string | null;
  target_id?: string | null;
  ip?: string | null;
  created_at?: string | null;
}

export interface CustomRole {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  base_role: string;
  permissions: string[];
  is_active: boolean | number;
  members: number;
}

export interface TwoFactorStatus {
  enabled: boolean;
  pending: boolean;
  confirmed_at?: string | null;
  backup_codes_left: number;
}

async function unwrap<T>(p: Promise<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const res = await p;
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? ({} as T));
}

export const security = {
  stats: () =>
    unwrap(
      laravel.get<{
        providers: number;
        scim_tokens: number;
        roles: number;
        events_30d: number;
        by_severity: Record<string, number>;
        users_total: number;
        users_2fa: number;
        permissions: string[];
      }>("/security/stats"),
    ),

  // SSO
  listProviders: () =>
    unwrap(
      laravel.get<{ data: SsoProvider[]; endpoints: Record<string, string> }>("/security/providers"),
    ),
  createProvider: (body: Partial<SsoProvider>) =>
    unwrap(laravel.post<{ ok: boolean; id: string }>("/security/providers", body)),
  updateProvider: (id: string, body: Partial<SsoProvider>) =>
    unwrap(laravel.patch<{ ok: boolean }>(`/security/providers/${id}`, body)),
  deleteProvider: (id: string) => unwrap(laravel.delete(`/security/providers/${id}`)),

  // SCIM
  listScimTokens: () =>
    unwrap(laravel.get<{ data: ScimToken[]; base_url: string }>("/security/scim-tokens")),
  createScimToken: (name: string) =>
    unwrap(laravel.post<{ ok: boolean; id: string; token: string }>("/security/scim-tokens", { name })),
  revokeScimToken: (id: string) => unwrap(laravel.delete(`/security/scim-tokens/${id}`)),

  // Политики
  getPolicy: () => unwrap(laravel.get<SecurityPolicy>("/security/policy")),
  updatePolicy: (body: Partial<SecurityPolicy>) =>
    unwrap(laravel.patch<{ ok: boolean }>("/security/policy", body)),

  // Аудит
  listAudit: (params?: { severity?: string; category?: string; search?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.severity) qs.set("severity", params.severity);
    if (params?.category) qs.set("category", params.category);
    if (params?.search) qs.set("search", params.search);
    if (params?.limit) qs.set("limit", String(params.limit));
    const s = qs.toString();
    return unwrap(laravel.get<{ data: AuditEvent[] }>(`/security/audit${s ? `?${s}` : ""}`));
  },
  auditExportUrl: (format: "csv" | "jsonl" | "cef") => {
    const base = (import.meta.env.VITE_LARAVEL_API_URL as string | undefined)?.replace(/\/+$/, "") || "/api";
    return `${base}/security/audit/export?format=${format}`;
  },

  // RBAC
  listRoles: () =>
    unwrap(laravel.get<{ data: CustomRole[]; permissions: string[] }>("/security/roles")),
  createRole: (body: Partial<CustomRole>) =>
    unwrap(laravel.post<{ ok: boolean; id: string }>("/security/roles", body)),
  updateRole: (id: string, body: Partial<CustomRole>) =>
    unwrap(laravel.patch<{ ok: boolean }>(`/security/roles/${id}`, body)),
  deleteRole: (id: string) => unwrap(laravel.delete(`/security/roles/${id}`)),
  roleMembers: (id: string) =>
    unwrap(
      laravel.get<{ data: { id: string; user_id: string; name?: string | null }[] }>(
        `/security/roles/${id}/members`,
      ),
    ),
  assignRole: (id: string, userIds: string[]) =>
    unwrap(laravel.post<{ ok: boolean; added: number }>(`/security/roles/${id}/members`, { user_ids: userIds })),
  unassignRole: (id: string, userId: string) =>
    unwrap(laravel.delete(`/security/roles/${id}/members/${userId}`)),

  // 2FA (личный кабинет)
  twoFactorStatus: () => unwrap(laravel.get<TwoFactorStatus>("/auth/2fa/status")),
  twoFactorSetup: () =>
    unwrap(laravel.post<{ secret: string; otpauth_url: string }>("/auth/2fa/setup")),
  twoFactorConfirm: (code: string) =>
    unwrap(laravel.post<{ ok: boolean; backup_codes: string[] }>("/auth/2fa/confirm", { code })),
  twoFactorDisable: (code: string) =>
    unwrap(laravel.post<{ ok: boolean }>("/auth/2fa/disable", { code })),
};

export const AUDIT_SEVERITY_LABELS: Record<AuditSeverity, string> = {
  info: "Информация",
  warning: "Внимание",
  critical: "Критично",
};

export const PERMISSION_LABELS: Record<string, string> = {
  "employees.read": "Сотрудники: просмотр",
  "employees.write": "Сотрудники: изменение",
  "positions.read": "Должности: просмотр",
  "positions.write": "Должности: изменение",
  "documents.read": "Документы: просмотр",
  "documents.sign": "Документы: подписание",
  "documents.manage": "Документы: управление",
  "courses.read": "Обучение: просмотр",
  "courses.manage": "Обучение: управление",
  "analytics.read": "Аналитика: просмотр",
  "analytics.export": "Аналитика: выгрузка",
  "performance.read": "Оценка: просмотр",
  "performance.manage": "Оценка: управление",
  "okr.read": "OKR: просмотр",
  "okr.manage": "OKR: управление",
  "surveys.read": "Опросы: просмотр",
  "surveys.manage": "Опросы: управление",
  "leaves.read": "Отпуска: просмотр",
  "leaves.approve": "Отпуска: согласование",
  "security.read": "Безопасность: просмотр",
  "security.manage": "Безопасность: управление",
  "integrations.manage": "Интеграции: управление",
};
