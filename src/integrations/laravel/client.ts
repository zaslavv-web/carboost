/**
 * Laravel REST client.
 *
 * Provides `aiInvoke(name, { body })` for AI scenarios and a generic
 * request helper. Returns `{ data, error }`.
 *
 * Configure via `VITE_LARAVEL_API_URL` (defaults to `/api`). The Sanctum
 * bearer token is read from `localStorage.laravel_token` (set by AuthContext).
 */

import {
  getStoredLaravelToken,
  notifyAuthSessionExpired,
  setStoredLaravelToken,
} from "@/lib/authStorage";

const BASE_URL =
  (import.meta.env.VITE_LARAVEL_API_URL as string | undefined)?.replace(/\/+$/, "") || "/api";

export const laravelAuth = {
  getToken(): string | null {
    return getStoredLaravelToken();
  },
  setToken(token: string | null) {
    setStoredLaravelToken(token);
  },
};

export interface LaravelInvokeResult<T = any> {
  data: T | null;
  error: { message: string; status?: number; code?: string; step?: string; diagnostics?: unknown } | null;
}


/**
 * Лёгкая перепроверка Sanctum-токена в обход обычного `request()`, чтобы
 * не зациклиться при 401 и не тащить лишние заголовки. Возвращает `true`,
 * если токен всё ещё валиден (сервер вернул 2xx на `/auth/me`).
 *
 * Кэшируем результат на короткое окно, чтобы серия параллельных 401 не
 * породила лавину параллельных проверок.
 */
let revalidateInflight: Promise<boolean> | null = null;
let revalidateCachedAt = 0;
let revalidateCached = false;
async function revalidateToken(token: string): Promise<boolean> {
  const now = Date.now();
  if (now - revalidateCachedAt < 2000) return revalidateCached;
  if (revalidateInflight) return revalidateInflight;
  revalidateInflight = (async () => {
    try {
      const apiUrl = new URL(`${BASE_URL}/auth/me`, window.location.origin);
      const sameOrigin = apiUrl.origin === window.location.origin;
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(apiUrl.toString(), {
          method: "GET",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          credentials: sameOrigin ? "same-origin" : "omit",
          signal: controller.signal,
        });
        // Валидным считаем 2xx. 401/419 → токен реально не годится.
        // Любые 5xx/сеть — не рвём сессию, доверяем существующему токену.
        if (res.ok) return true;
        if (res.status === 401 || res.status === 419) return false;
        return true;
      } finally {
        window.clearTimeout(timer);
      }
    } catch {
      // Сеть/таймаут — не разлогиниваем.
      return true;
    }
  })().then((ok) => {
    revalidateCached = ok;
    revalidateCachedAt = Date.now();
    revalidateInflight = null;
    return ok;
  });
  return revalidateInflight;
}

/**
 * Ограничитель параллелизма.
 *
 * Хостинг ограничивает число одновременных подключений MySQL: когда экран
 * стартует и разом уходит 8-10 запросов, часть из них падает с 503/500.
 * Держим не больше MAX_CONCURRENT запросов «в полёте» — остальные ждут
 * в очереди миллисекунды, зато ни один не теряется.
 */
const MAX_CONCURRENT = 4;
let inFlight = 0;
const waiters: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiters.push(resolve));
}

function releaseSlot() {
  const next = waiters.shift();
  if (next) next();
  else inFlight--;
}

const CIRCUIT_COOLDOWN_MS = 12_000;
let circuitOpenUntil = 0;

export function isBackendCircuitOpen(): boolean {
  return Date.now() < circuitOpenUntil;
}

function openBackendCircuit() {
  circuitOpenUntil = Math.max(circuitOpenUntil, Date.now() + CIRCUIT_COOLDOWN_MS);
  window.dispatchEvent(
    new CustomEvent("laravel:backend-overloaded", { detail: { until: circuitOpenUntil } }),
  );
}

async function rawRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<LaravelInvokeResult<T>> {

  const token = laravelAuth.getToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const timeoutMs = path === "/auth/me" ? 8000 : 30000;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const apiUrl = new URL(`${BASE_URL}${path}`, window.location.origin);
    const sameOrigin = apiUrl.origin === window.location.origin;
    const res = await fetch(apiUrl.toString(), {
      ...init,
      headers,
      credentials: init.credentials ?? (sameOrigin ? "same-origin" : "omit"),
      signal: init.signal ?? controller.signal,
    });
    const ctype = res.headers.get("content-type") || "";
    const text = await res.text();
    let body: any = null;
    let parsedJson = false;
    if (text) {
      try {
        body = JSON.parse(text);
        parsedJson = true;
      } catch {
        body = text;
      }
    }
    // Бэкенд недоступен: nginx отдал SPA-html вместо JSON от Laravel.
    // Часто проявляется как 200 OK + index.html — фронт молча падает.
    const looksLikeHtml =
      !parsedJson &&
      (ctype.includes("text/html") ||
        (typeof body === "string" && body.trim().startsWith("<")));
    if (looksLikeHtml) {
      return {
        data: null,
        error: {
          message:
            "Backend недоступен: сервер вернул HTML вместо JSON. Проверьте, что Laravel-контейнер запущен и nginx проксирует /api на LARAVEL_HOST.",
          status: res.status,
        },
      };
    }
    if (!res.ok) {
      const validationErrors =
        body && typeof body === "object" && body.errors && typeof body.errors === "object"
          ? Object.values(body.errors).flat().filter(Boolean).join("\n")
          : "";
      const message =
        validationErrors ||
        (body && typeof body === "object" && (body.error || body.message)) ||
        res.statusText ||
        "Ошибка запроса";
      const code =
        body && typeof body === "object" && typeof body.error_code === "string"
          ? body.error_code
          : undefined;
      const step =
        body && typeof body === "object" && typeof body.step === "string"
          ? body.step
          : undefined;
      const diagnostics =
        body && typeof body === "object" && "diagnostics" in body
          ? body.diagnostics
          : undefined;
      if (token && (res.status === 401 || res.status === 419)) {
        // Не выкидываем пользователя сразу: конкретный endpoint мог вернуть 401
        // по ошибке policy/middleware, а токен на самом деле валиден.
        // Перепроверяем через /auth/me — рвём сессию только если и она вернула 401/419.
        if (path !== "/auth/me") {
          const stillValid = await revalidateToken(token);
          if (!stillValid) notifyAuthSessionExpired(String(message), res.status);
        } else {
          notifyAuthSessionExpired(String(message), res.status);
        }
      }
      return { data: null, error: { message: String(message), status: res.status, code, step, diagnostics } };
    }

    return { data: body as T, error: null };
  } catch (e: any) {
    const rawMessage = String(e?.message || "Network error");
    const isAbort = e?.name === "AbortError";
    const isClosedConnection = /ERR_CONNECTION_CLOSED|Failed to fetch|NetworkError|Load failed/i.test(rawMessage);
    return {
      data: null,
      error: {
        message: isAbort
          ? "Backend не ответил вовремя. Сессия сохранена — повторите запрос через несколько секунд."
          : isClosedConnection
          ? "Backend разорвал соединение. Проверьте, что Laravel/PHP-FPM запущен, миграции применены, а nginx корректно проксирует /api."
          : rawMessage,
        code: isAbort ? "backend_timeout" : isClosedConnection ? "backend_network" : undefined,
      },
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * Публичная обёртка: очередь параллелизма + circuit breaker. Повтор внутри
 * одного HTTP-запроса выполняет серверный RetryOnDbBusy; браузер не создаёт
 * второй каскад запросов при уже исчерпанном лимите MySQL.
 */
async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<LaravelInvokeResult<T>> {
  const method = (init.method || "GET").toUpperCase();
  const idempotent = method === "GET" || method === "HEAD";
  // Пока база восстанавливается, фоновые GET/HEAD не должны создавать новые
  // PHP-процессы и попытки подключения. Записывающие действия пользователя
  // пропускаем, чтобы интерфейс не блокировал явную команду без обращения к API.
  if (idempotent && isBackendCircuitOpen()) {
    return {
      data: null,
      error: {
        message: "Сервис временно перегружен. Повторите через несколько секунд.",
        status: 503,
        code: "db_busy",
      },
    };
  }

  await acquireSlot();
  let result: LaravelInvokeResult<T>;
  try {
    result = await rawRequest<T>(path, init);
  } finally {
    releaseSlot();
  }

  const status = result.error?.status;
  const overloaded =
    result.error?.code === "db_busy" ||
    result.error?.code === "backend_timeout" ||
    result.error?.code === "backend_network" ||
    status === 503;

  if (!overloaded) return result;

  openBackendCircuit();

  return {
    data: null,
    error: {
      ...result.error,
      message:
        "Сервис временно перегружен: база данных не успевает обрабатывать запросы. Повторите через несколько секунд.",
      code: "db_busy",
    },
  };
}



/** Invoke a Laravel AI endpoint at `/ai/{name}` with `{ body }`. */
export function aiInvoke<T = any>(
  name: string,
  options: { body?: any } = {},
): Promise<LaravelInvokeResult<T>> {
  return request<T>(`/ai/${name}`, {
    method: "POST",
    body: JSON.stringify(options.body ?? {}),
  });
}

/** Open SSE stream for `/api/ai/assessment-chat`. */
export function aiStream(
  name: string,
  body: any,
  init: { signal?: AbortSignal } = {},
): Promise<Response> {
  const token = laravelAuth.getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE_URL}/ai/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: init.signal,
  });
}

/** Generic helpers for upcoming CRUD migration. */
export const laravel = {
  get: <T = any>(path: string) => request<T>(path, { method: "GET" }),
  post: <T = any>(path: string, body?: any) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: <T = any>(path: string, body?: any) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: <T = any>(path: string, body?: any) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  delete: <T = any>(path: string) => request<T>(path, { method: "DELETE" }),
};
