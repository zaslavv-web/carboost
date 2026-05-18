/**
 * Laravel REST client (Phase 8).
 *
 * Drop-in replacement for `supabase.functions.invoke(name, { body })` for all
 * AI scenarios. Returns the same `{ data, error }` shape so call sites only
 * need to swap the import.
 *
 * Configure via `VITE_LARAVEL_API_URL` (defaults to `/api`). The Sanctum
 * bearer token is read from `localStorage.laravel_token` (set by AuthContext
 * once the Laravel auth migration ships).
 */

const BASE_URL =
  (import.meta.env.VITE_LARAVEL_API_URL as string | undefined)?.replace(/\/+$/, "") || "/api";

const TOKEN_KEY = "laravel_token";

export const laravelAuth = {
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  setToken(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export interface LaravelInvokeResult<T = any> {
  data: T | null;
  error: { message: string; status?: number } | null;
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

  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
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
      return { data: null, error: { message: String(message), status: res.status } };
    }
    return { data: body as T, error: null };
  } catch (e: any) {
    return { data: null, error: { message: e?.message || "Network error" } };
  }
}

/** Drop-in for `supabase.functions.invoke("name", { body })`. */
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
