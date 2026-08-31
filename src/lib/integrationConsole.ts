/**
 * Общая механика двух интеграционных консолей (приём и выдача данных).
 *
 * Консоли задуманы под отдельные поддомены, но обращаются к тому же Laravel,
 * что и основное приложение: .htaccess роутит /api в backend/public из того же
 * докрута, поэтому запросы остаются same-origin и CORS не участвует.
 */

/** Первый лейбл хоста, по которому выбирается консоль. */
export const OUTBOUND_HOST_PREFIX = "api-out";
export const INBOUND_HOST_PREFIX = "api-in";

export const API_BASE = "/api/integration/v1";

/**
 * Ключ живёт в sessionStorage, а не в localStorage: это учётные данные, и
 * закрытая вкладка должна их забывать. Плюс так ключ не переживает
 * перезагрузку браузера на чужой машине.
 */
const KEY_STORAGE = "integration-console.key";

export const loadKey = (): string => {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
};

export const saveKey = (key: string): void => {
  try {
    if (key) sessionStorage.setItem(KEY_STORAGE, key);
    else sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    /* приватный режим — работаем без сохранения */
  }
};

export type ResourceMeta = {
  name: string;
  title: string;
  scope_read: string;
  scope_write: string;
  granted: { read: boolean; write: boolean };
  operations: string[];
  fields: { read: string[]; write: string[] };
  filters: string[];
  external_id: boolean;
  events: string[];
};

export type MetaResponse = {
  version: string;
  resources: ResourceMeta[];
  scopes: string[];
  events: string[];
};

export type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  /** Готовое к показу сообщение: у API это error/message, у сети — текст сбоя. */
  error: string | null;
  durationMs: number;
};

/**
 * Единая точка вызова API.
 *
 * Никогда не бросает: консоль должна показывать отказ как результат, а не
 * падать белым экраном. Ключ уходит только в заголовок Authorization.
 */
export async function callApi<T = unknown>(
  path: string,
  key: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const started = performance.now();

  if (!key.trim()) {
    return { ok: false, status: 0, data: null, error: "Не указан API-ключ", durationMs: 0 };
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key.trim()}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });

    const durationMs = Math.round(performance.now() - started);
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Не JSON — почти всегда SPA-фолбэк вместо API. Показываем как есть.
      return {
        ok: false,
        status: response.status,
        data: null,
        error: `Ответ не является JSON (HTTP ${response.status}). Начало: ${text.slice(0, 120)}`,
        durationMs,
      };
    }

    if (!response.ok) {
      const body = parsed as { message?: string; error?: string } | null;
      return {
        ok: false,
        status: response.status,
        data: null,
        error: body?.message || body?.error || `HTTP ${response.status}`,
        durationMs,
      };
    }

    return { ok: true, status: response.status, data: parsed as T, error: null, durationMs };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: e instanceof Error ? e.message : "Сеть недоступна",
      durationMs: Math.round(performance.now() - started),
    };
  }
}

/** Пример вызова для копирования. Ключ подставляется плейсхолдером. */
export function curlSnippet(method: string, path: string, body?: string): string {
  const origin = typeof window === "undefined" ? "https://growth-peak.pro" : window.location.origin;
  const lines = [
    `curl -X ${method} '${origin}${API_BASE}${path}'`,
    `  -H 'Authorization: Bearer <ВАШ_КЛЮЧ>'`,
    `  -H 'Accept: application/json'`,
  ];
  if (body) {
    lines.push(`  -H 'Content-Type: application/json'`);
    lines.push(`  -d '${body}'`);
  }
  return lines.join(" \\\n");
}

/** Человекочитаемый размер ответа — помогает заметить неожиданно тяжёлую выборку. */
export function formatBytes(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}
