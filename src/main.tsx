import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import ErrorBoundary from "@/components/ErrorBoundary";

// ─── Unregister service workers in preview/iframe contexts ──────────────────
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("preview.local");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
}

// ─── Recover from stale-chunk / stale-session crashes ───────────────────────
// Симптом «чёрный экран при повторном входе» обычно вызывает одно из двух:
// 1) Браузер закэшировал старый index.html → ссылается на удалённые
//    /assets/*-HASH.js → dynamic import падает с ChunkLoadError.
// 2) В localStorage остался токен/legacy-ключ от прошлой версии БД → при
//    рендере провайдеры падают на неожиданном payload-е.
// Делаем одноразовую авто-перезагрузку (с очисткой кэша/токенов), чтобы
// пользователь не видел пустую страницу.
const RELOAD_GUARD = "lp:chunk-reload-attempted";

function isStaleChunkError(reason: unknown): boolean {
  const msg = String(
    (reason as { message?: string })?.message ??
      (reason as { reason?: { message?: string } })?.reason?.message ??
      reason ??
      "",
  );
  const name = String((reason as { name?: string })?.name ?? "");
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

function attemptRecovery(reason: unknown) {
  if (!isStaleChunkError(reason)) return;
  try {
    if (sessionStorage.getItem(RELOAD_GUARD)) return; // уже пытались — не зацикливаемся
    sessionStorage.setItem(RELOAD_GUARD, String(Date.now()));
  } catch {
    /* ignore */
  }

  // Чистим всё, что может «зафиксировать» сломанное состояние между деплоями.
  try {
    // Снимаем потенциально протухшую сессию — после reload пользователь
    // увидит логин-форму вместо пустого экрана.
    localStorage.removeItem("laravel_token");
  } catch { /* ignore */ }

  try {
    if ("caches" in window) {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
    }
  } catch { /* ignore */ }

  try {
    navigator.serviceWorker?.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
  } catch { /* ignore */ }

  // Жёсткий reload с bypass-кэшем
  setTimeout(() => window.location.reload(), 50);
}

window.addEventListener("error", (event) => attemptRecovery(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => attemptRecovery(event.reason));

// Если рендер прошёл — сбрасываем guard, чтобы следующий реальный сбой снова
// мог запустить recovery.
window.addEventListener("load", () => {
  setTimeout(() => {
    try { sessionStorage.removeItem(RELOAD_GUARD); } catch { /* ignore */ }
  }, 4000);
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
