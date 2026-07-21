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
  error: { message: string; status?: number; code?: string } | null;
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

async function request<T>(
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
      return { data: null, error: { message: String(message), status: res.status, code } };
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
          ? "Backend не ответил вовремя. Сессия будет сброшена, чтобы не показывать чёрный экран."
          : isClosedConnection
          ? "Backend разорвал соединение. Проверьте, что Laravel/PHP-FPM запущен, миграции применены, а nginx корректно проксирует /api."
          : rawMessage,
      },
    };
  } finally {
    window.clearTimeout(timeout);
  }
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
