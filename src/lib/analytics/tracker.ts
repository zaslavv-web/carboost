/**
 * Внутренний продуктовый трекер (аналог Mixpanel) — собственный, без внешних сервисов.
 *
 * - Сессия живёт 30 мин неактивности (sessionStorage).
 * - Буфер событий шлётся каждые 5 c или по 20 событий, на unload — sendBeacon.
 * - Автотрек: page_view, JS-ошибки, unhandledrejection, клики по [data-track].
 * - Ручной API: `track(name, props?)`.
 * - Перехват fetch для api_call/api_error по /api/*.
 *
 * Эндпоинт: POST /api/analytics/ingest  (публичный, см. routes/api.php).
 */

type EventType =
  | "page_view"
  | "action"
  | "api_call"
  | "api_error"
  | "js_error"
  | "session_start"
  | "session_end"
  | "perf";

interface AnalyticsEvent {
  event_type: EventType;
  event_name: string;
  session_id: string;
  occurred_at: string;
  route?: string;
  path?: string;
  referrer?: string;
  component?: string;
  target?: string;
  duration_ms?: number;
  status_code?: number;
  properties?: Record<string, unknown>;
  app_version?: string;
  locale?: string;
}

const SESSION_KEY = "gp_analytics_session";
const IDLE_MS = 30 * 60 * 1000;
const FLUSH_EVERY_MS = 5000;
const FLUSH_AT_COUNT = 20;
const APP_VERSION =
  (import.meta as any).env?.VITE_APP_VERSION ?? "dev";
const BASE_URL =
  (import.meta as any).env?.VITE_LARAVEL_API_URL?.replace(/\/+$/, "") || "/api";
const INGEST_URL = `${BASE_URL}/analytics/ingest`;

const uuid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

interface Session {
  id: string;
  started_at: string;
  last_seen_at: number;
  route: string;
  locale: string;
  device: string;
  viewport: string;
  app_version: string;
}

const detectDevice = (): string => {
  const w = window.innerWidth;
  if (w < 640) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
};

const loadSession = (): Session => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const s: Session = JSON.parse(raw);
      if (Date.now() - s.last_seen_at < IDLE_MS) return s;
    }
  } catch {
    /* ignore */
  }
  const s: Session = {
    id: uuid(),
    started_at: new Date().toISOString(),
    last_seen_at: Date.now(),
    route: location.pathname,
    locale: (typeof navigator !== "undefined" && navigator.language) || "ru",
    device: detectDevice(),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    app_version: APP_VERSION,
  };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  return s;
};

const saveSession = (s: Session) => {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
};

class Tracker {
  private session: Session;
  private queue: AnalyticsEvent[] = [];
  private timer: number | null = null;
  private started = false;

  constructor() {
    this.session = loadSession();
  }

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;

    // session_start (только если новая сессия — created within 2 c)
    if (Date.now() - new Date(this.session.started_at).getTime() < 2000) {
      this.enqueue("session_start", "session.start", { route: location.pathname });
    }

    // Авто-перехват ошибок
    window.addEventListener("error", (e) => {
      this.enqueue("js_error", "js.error", undefined, {
        component: (e.filename || "").split("/").pop()?.slice(-80),
        properties: {
          message: String(e.message || "").slice(0, 240),
        },
      });
    });
    window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
      const msg = (e.reason && (e.reason.message || String(e.reason))) || "unhandledrejection";
      this.enqueue("js_error", "js.unhandledrejection", undefined, {
        properties: { message: String(msg).slice(0, 240) },
      });
    });

    // Авто-перехват кликов по [data-track]
    document.addEventListener(
      "click",
      (e) => {
        const t = (e.target as HTMLElement | null)?.closest?.("[data-track]");
        if (!t) return;
        const name = t.getAttribute("data-track") || "ui.click";
        this.track(name, { target: t.getAttribute("data-track-target") || t.tagName.toLowerCase() });
      },
      true,
    );

    // Авто-перехват fetch для /api/*
    this.patchFetch();

    // Flush таймер
    this.timer = window.setInterval(() => this.flush(false), FLUSH_EVERY_MS);

    // Beacon на unload
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.flush(true);
    });
    window.addEventListener("pagehide", () => this.flush(true));
    window.addEventListener("beforeunload", () => this.flush(true));
  }

  trackPageView(route: string) {
    this.session.route = route;
    this.session.last_seen_at = Date.now();
    saveSession(this.session);
    this.enqueue("page_view", "page.view", { route });
  }

  track(name: string, properties?: Record<string, unknown>) {
    this.enqueue("action", name, { route: location.pathname }, { properties });
  }

  private enqueue(
    type: EventType,
    name: string,
    base?: { route?: string; status_code?: number; duration_ms?: number },
    extra?: { properties?: Record<string, unknown>; component?: string; target?: string },
  ) {
    this.session.last_seen_at = Date.now();
    saveSession(this.session);
    this.queue.push({
      event_type: type,
      event_name: name,
      session_id: this.session.id,
      occurred_at: new Date().toISOString(),
      route: base?.route ?? location.pathname,
      path: location.pathname + location.search,
      referrer: document.referrer || undefined,
      status_code: base?.status_code,
      duration_ms: base?.duration_ms,
      properties: extra?.properties,
      component: extra?.component,
      target: extra?.target,
      app_version: APP_VERSION,
      locale: this.session.locale,
    });
    if (this.queue.length >= FLUSH_AT_COUNT) this.flush(false);
  }

  private patchFetch() {
    if ((window as any).__gpFetchPatched) return;
    (window as any).__gpFetchPatched = true;
    const orig = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const started = performance.now();
      const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
      const isApi =
        url.startsWith(BASE_URL) ||
        url.startsWith("/api/") ||
        url.includes("/api/");
      // не трекаем сам ingest — иначе бесконечная петля
      if (isApi && url.includes("/analytics/ingest")) return orig(...args);
      try {
        const res = await orig(...args);
        if (isApi) {
          const dur = Math.round(performance.now() - started);
          const apiRoute = (() => {
            try {
              const u = new URL(url, location.origin);
              return u.pathname;
            } catch {
              return url;
            }
          })();
          if (!res.ok) {
            this.enqueue("api_error", "api." + (args[1]?.method || "GET").toLowerCase(), {
              route: apiRoute,
              status_code: res.status,
              duration_ms: dur,
            });
          } else {
            this.enqueue("api_call", "api." + (args[1]?.method || "GET").toLowerCase(), {
              route: apiRoute,
              status_code: res.status,
              duration_ms: dur,
            });
          }
        }
        return res;
      } catch (e: any) {
        if (isApi) {
          this.enqueue("api_error", "api.network_error", {
            route: url,
            duration_ms: Math.round(performance.now() - started),
          });
        }
        throw e;
      }
    };
  }

  flush(viaBeacon: boolean) {
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0, this.queue.length);
    const body = JSON.stringify({
      events,
      session: {
        id: this.session.id,
        started_at: this.session.started_at,
        route: this.session.route,
        locale: this.session.locale,
        device: this.session.device,
        viewport: this.session.viewport,
        app_version: this.session.app_version,
        ended: viaBeacon ? true : undefined,
        ended_reason: viaBeacon ? "beacon" : undefined,
      },
    });
    if (viaBeacon && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      try {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(INGEST_URL, blob);
        return;
      } catch {
        /* fall through */
      }
    }
    const token = (() => {
      try {
        return localStorage.getItem("laravel_token");
      } catch {
        return null;
      }
    })();
    fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
      keepalive: true,
    }).catch(() => {
      // молча игнорируем — телеметрия не должна ломать UX
    });
  }
}

const tracker = new Tracker();

export const initAnalytics = () => tracker.start();
export const track = (name: string, properties?: Record<string, unknown>) =>
  tracker.track(name, properties);
export const trackPageView = (route: string) => tracker.trackPageView(route);
