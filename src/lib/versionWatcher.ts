/**
 * Слежение за версией фронтенда.
 *
 * Проблема: браузер держит старый `index.html` в кэше и продолжает выполнять
 * бандл, которого на сервере уже нет. Пользователь видит «ничего не поменялось»
 * и старые запросы к API.
 *
 * Решение: CI кладёт рядом с бандлом `version.json` ({"version":"<sha>"}).
 * Первое значение запоминаем, дальше периодически (и при возврате на вкладку)
 * сверяем — если версия изменилась, перезагружаем страницу.
 */

const VERSION_URL = "/version.json";
const POLL_MS = 5 * 60 * 1000;
const RELOAD_GUARD = "lp:version-reload-at";
const RELOAD_COOLDOWN_MS = 60 * 1000;

let knownVersion: string | null = null;
let started = false;

async function fetchVersion(): Promise<string | null> {
  // Офлайн/смена сети — не дёргаем сеть, иначе браузер пишет
  // ERR_NETWORK_CHANGED / ERR_INTERNET_DISCONNECTED в консоль.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  try {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? window.setTimeout(() => ctrl.abort(), 8000) : null;
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
      cache: "no-store",
      signal: ctrl?.signal,
    }).finally(() => {
      if (timer) window.clearTimeout(timer);
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) return null; // SPA-фолбэк отдал index.html
    const body = (await res.json()) as { version?: string };
    return typeof body?.version === "string" && body.version ? body.version : null;
  } catch {
    // Сетевые сбои (смена Wi-Fi/VPN, обрыв) — не ошибка приложения.
    return null;
  }
}


function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD) || 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(RELOAD_GUARD, String(Date.now()));
  } catch {
    /* ignore */
  }

  try {
    if ("caches" in window) {
      void caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
    }
  } catch {
    /* ignore */
  }

  window.location.reload();
}

async function check() {
  const version = await fetchVersion();
  if (!version) return;
  if (knownVersion === null) {
    knownVersion = version;
    return;
  }
  if (version !== knownVersion) {
    knownVersion = version;
    reloadOnce();
  }
}

export function startVersionWatcher() {
  if (started) return;
  started = true;

  void check();
  window.setInterval(() => void check(), POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
}
