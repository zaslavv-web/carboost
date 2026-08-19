/**
 * Общие помощники для E2E: логин через Sanctum, обёртки над fetch,
 * сбор статусов ответов. Используется и API-, и UI-спеками.
 *
 * Конфигурация через env:
 *   E2E_BASE_URL   — базовый URL приложения (по умолчанию http://localhost:8080)
 *   E2E_API_URL    — базовый URL API (по умолчанию `${E2E_BASE_URL}/api`)
 *   E2E_<ROLE>_EMAIL / E2E_<ROLE>_PASSWORD — креды на роль
 *     ROLE ∈ HRD | HR | MANAGER | EMPLOYEE | ADMIN | SUPERADMIN
 *
 * Если кредов на роль нет — спека помечается skipped, а не падает.
 * Все сценарии по умолчанию read-only; мутации живут в отдельных спеках
 * и включаются флагом E2E_ALLOW_WRITES=1.
 */

export type Role = "HRD" | "HR" | "MANAGER" | "EMPLOYEE" | "ADMIN" | "SUPERADMIN";

export const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
export const API_URL = (process.env.E2E_API_URL ?? `${BASE_URL}/api`).replace(/\/+$/, "");
export const ALLOW_WRITES = process.env.E2E_ALLOW_WRITES === "1";

export function credsFor(role: Role): { email: string; password: string } | null {
  const email = process.env[`E2E_${role}_EMAIL`];
  const password = process.env[`E2E_${role}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
}

export interface ApiResult<T = any> {
  status: number;
  ok: boolean;
  body: T | null;
  ms: number;
}

export async function api<T = any>(
  path: string,
  init: { method?: string; token?: string | null; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const started = Date.now();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  let body: any = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }

  return { status: res.status, ok: res.ok, body, ms: Date.now() - started };
}

const tokenCache = new Map<Role, string>();

/** Логинится под ролью и возвращает Sanctum-токен (кешируется на прогон). */
export async function loginAs(role: Role): Promise<string | null> {
  const cached = tokenCache.get(role);
  if (cached) return cached;

  const creds = credsFor(role);
  if (!creds) return null;

  const res = await api<{ token?: string; "2fa_required"?: boolean }>("/auth/login", {
    method: "POST",
    body: creds,
  });

  if (res.body?.["2fa_required"]) {
    throw new Error(`У учётки роли ${role} включена 2FA — E2E не может пройти challenge автоматически`);
  }
  const token = res.body?.token;
  if (!token) return null;

  tokenCache.set(role, token);
  return token;
}
