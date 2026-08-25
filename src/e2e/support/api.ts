/**
 * Общие помощники для E2E: логин через Sanctum, обёртки над fetch,
 * сбор статусов ответов. Используется и API-, и UI-спеками.
 *
 * Конфигурация через env:
 *   E2E_BASE_URL   — базовый URL приложения (по умолчанию https://growth-peak.pro)
 *   E2E_API_URL    — базовый URL API (по умолчанию `${E2E_BASE_URL}/api`)
 *   E2E_<ROLE>_EMAIL / E2E_<ROLE>_PASSWORD — креды на роль
 *     ROLE ∈ HRD | HR | MANAGER | EMPLOYEE | ADMIN | SUPERADMIN
 *
 * Если кредов на роль нет — спека помечается skipped, а не падает.
 * Все сценарии по умолчанию read-only; мутации живут в отдельных спеках
 * и включаются флагом E2E_ALLOW_WRITES=1.
 */

export type Role = "HRD" | "HR" | "MANAGER" | "EMPLOYEE" | "ADMIN" | "SUPERADMIN";

/** Стенд по умолчанию: боевой контур (ночной смоук работает и без секрета). */
export const DEFAULT_BASE_URL = "https://growth-peak.pro";

/**
 * GitHub Actions подставляет незаданный секрет пустой строкой, поэтому `??`
 * не спасает: `E2E_BASE_URL=""` давал `page.goto("")` → invalid URL.
 * Пустые/пробельные значения считаем «не задано».
 */
export function envOrNull(name: string): string | null {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  return value === "" ? null : value;
}

/** Нормализует URL: дописывает схему и срезает хвостовые слэши. */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export const BASE_URL = normalizeUrl(envOrNull("E2E_BASE_URL") ?? DEFAULT_BASE_URL);
export const API_URL = normalizeUrl(envOrNull("E2E_API_URL") ?? `${BASE_URL}/api`);
export const ALLOW_WRITES = process.env.E2E_ALLOW_WRITES === "1";

export const ALL_ROLES: Role[] = ["HRD", "HR", "MANAGER", "EMPLOYEE", "ADMIN", "SUPERADMIN"];

export function credsFor(role: Role): { email: string; password: string } | null {
  const email = envOrNull(`E2E_${role}_EMAIL`);
  const password = envOrNull(`E2E_${role}_PASSWORD`);
  if (!email || !password) return null;
  return { email, password };
}

/** Роли, для которых заданы полные креды. */
export function rolesWithCreds(): Role[] {
  return ALL_ROLES.filter((r) => credsFor(r) !== null);
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Логинится под ролью и возвращает Sanctum-токен (кешируется на прогон).
 * На боевом стенде включён rate limit на /auth/login: параллельные воркеры
 * ловят 429, поэтому логин ретраится с экспоненциальной паузой.
 */
export async function loginAs(role: Role): Promise<string | null> {
  const cached = tokenCache.get(role);
  if (cached) return cached;

  const creds = credsFor(role);
  if (!creds) return null;

  let last: ApiResult<any> | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await api<{ token?: string; "2fa_required"?: boolean }>("/auth/login", {
      method: "POST",
      body: creds,
    });
    last = res;

    if (res.body?.["2fa_required"]) {
      throw new Error(`У учётки роли ${role} включена 2FA — E2E не может пройти challenge автоматически`);
    }

    const token = res.body?.token;
    if (token) {
      tokenCache.set(role, token);
      return token;
    }

    // 429 (rate limit) и 5xx — временные, ждём и пробуем ещё раз.
    if (res.status !== 429 && res.status < 500) break;
    await sleep(5000 * (attempt + 1));
  }

  throw new Error(
    `Логин роли ${role} (${creds.email}) не удался: HTTP ${last?.status} ${JSON.stringify(last?.body)?.slice(0, 200)}`,
  );
}

