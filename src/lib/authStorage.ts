export const LARAVEL_TOKEN_KEY = "laravel_token";
export const AUTH_SESSION_EXPIRED_EVENT = "laravel-auth-session-expired";
export const AUTH_STORAGE_CLEARED_EVENT = "laravel-auth-storage-cleared";

const LOCAL_AUTH_KEYS = [
  LARAVEL_TOKEN_KEY,
  "pending-social-signup",
] as const;

const SESSION_AUTH_KEYS = [
  "impersonatedUserId",
  "impersonatedName",
  "impersonatedRoles",
  "impersonatedProfile",
  "impersonationOriginalToken",
  "impersonationOriginalUser",
] as const;

const safeRemove = (storage: Storage | undefined, key: string) => {
  try {
    storage?.removeItem(key);
  } catch {
    /* storage can throw when browser cookies/storage are restricted */
  }
};

export const getStoredLaravelToken = (): string | null => {
  try {
    return window.localStorage.getItem(LARAVEL_TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setStoredLaravelToken = (token: string | null) => {
  try {
    if (token) window.localStorage.setItem(LARAVEL_TOKEN_KEY, token);
    else window.localStorage.removeItem(LARAVEL_TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

export const clearStoredAuthState = (options: {
  includeToken?: boolean;
  reason?: string;
  notify?: boolean;
} = {}) => {
  const { includeToken = true, reason = "auth_reset", notify = true } = options;

  try {
    LOCAL_AUTH_KEYS.forEach((key) => {
      if (key === LARAVEL_TOKEN_KEY && !includeToken) return;
      safeRemove(window.localStorage, key);
    });
  } catch {
    /* ignore */
  }

  try {
    SESSION_AUTH_KEYS.forEach((key) => safeRemove(window.sessionStorage, key));
  } catch {
    /* ignore */
  }

  if (notify && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(AUTH_STORAGE_CLEARED_EVENT, { detail: { reason } }),
    );
  }
};

export const notifyAuthSessionExpired = (reason: string, status?: number) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AUTH_SESSION_EXPIRED_EVENT, { detail: { reason, status } }),
  );
};

export const isProbablyLaravelToken = (token: string | null): token is string => {
  if (!token) return false;
  const value = token.trim();
  if (value.length < 24 || /\s/.test(value)) return false;
  return /^[A-Za-z0-9|._~+/=-]+$/.test(value);
};
