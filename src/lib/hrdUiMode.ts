/**
 * HRD Today-mode canary flag.
 *
 * First iteration: gated to a single account. Mode is persisted in
 * localStorage so the choice survives reloads without touching the backend.
 * Later we migrate this into `profiles.ui_mode` and remove the allowlist.
 */

export type HrdUiMode = "today" | "classic";

/** Emails allowed to see the Today experience. Extend cautiously. */
const STORAGE_KEY = "hrd_ui_mode";

/**
 * Today-режим включён для всех HRD. Функция оставлена для совместимости
 * с существующими вызовами и просто проверяет наличие email.
 */
export const isTodayCanary = (email: string | null | undefined): boolean =>
  !!email;

export const readHrdUiMode = (): HrdUiMode | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "today" || raw === "classic") return raw;
  } catch { /* ignore */ }
  return null;
};

export const writeHrdUiMode = (mode: HrdUiMode): void => {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
};

export const clearHrdUiMode = (): void => {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
};
