/**
 * Laravel-backed AuthContext.
 *
 * Exposes `{ session, user, loading, signOut }` plus explicit helpers for
 * login / register / google / reset. Consumers use `useAuth()` from
 * `@/contexts/AuthContext`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { laravelAuthApi, type LaravelUser } from "@/integrations/laravel/auth";
import { laravelAuth } from "@/integrations/laravel/client";
import {
  AUTH_SESSION_EXPIRED_EVENT,
  clearStoredImpersonationState,
  clearStoredAuthState,
  isProbablyLaravelToken,
} from "@/lib/authStorage";

export interface LaravelSessionLike {
  access_token: string;
  user: LaravelUser;
}

export type LaravelAuthStatus = "checking" | "authenticated" | "guest" | "failed";

interface LaravelAuthContextType {
  session: LaravelSessionLike | null;
  user: LaravelUser | null;
  loading: boolean;
  authReady: boolean;
  authStatus: LaravelAuthStatus;
  authError: string | null;
  signOut: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<LaravelUser>;
  completeTwoFactor: (challengeToken: string, code: string) => Promise<LaravelUser>;
  signUp: (payload: Parameters<typeof laravelAuthApi.register>[0]) => Promise<LaravelUser>;
  signInWithGoogle: (redirectTo?: string) => void;
  signInWithYandex: (redirectTo?: string) => void;
  refresh: () => Promise<void>;
  clearSession: (reason?: string) => Promise<void>;
}

const noop = () => {};
const stub = async () => {
  throw new Error("LaravelAuthProvider is not mounted");
};

const LaravelAuthContext = createContext<LaravelAuthContextType>({
  session: null,
  user: null,
  loading: true,
  authReady: false,
  authStatus: "checking",
  authError: null,
  signOut: async () => {},
  signInWithPassword: stub as never,
  completeTwoFactor: stub as never,
  signUp: stub as never,
  signInWithGoogle: noop,
  signInWithYandex: noop,
  refresh: async () => {},
  clearSession: async () => {},
});

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function isTransientAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const typed = error as Error & { status?: number; code?: string };
  if (typed.status && typed.status >= 500) return true;
  return typed.code === "db_busy" || typed.code === "backend_timeout" || typed.code === "backend_network";
}

export const useLaravelAuth = () => useContext(LaravelAuthContext);

export const LaravelAuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<LaravelUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [authStatus, setAuthStatus] = useState<LaravelAuthStatus>("checking");
  const [authError, setAuthError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const clearSession = useCallback(async (reason = "auth_reset") => {
    clearStoredAuthState({ includeToken: true, reason });
    setUser(null);
    setAuthStatus("guest");
    setAuthError(null);
    setAuthReady(true);
    setLoading(false);
    queryClient.clear();
  }, [queryClient]);

  const failSession = useCallback((reason: string, message: string) => {
    clearStoredAuthState({ includeToken: true, reason });
    setUser(null);
    setAuthStatus("failed");
    setAuthError(message);
    setAuthReady(true);
    setLoading(false);
    queryClient.clear();
  }, [queryClient]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setAuthReady(false);
    setAuthStatus("checking");
    setAuthError(null);
    try {
      const token = laravelAuth.getToken();
      if (!token) {
        clearStoredImpersonationState("no_token_on_boot");
        setUser(null);
        setAuthStatus("guest");
        return;
      }
      if (!isProbablyLaravelToken(token)) {
        failSession("malformed_token", "Сохранённая сессия повреждена.");
        return;
      }
      let me: LaravelUser | null = null;
      let lastAuthError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          me = await laravelAuthApi.me();
          lastAuthError = null;
          break;
        } catch (e) {
          lastAuthError = e;
          if (!isTransientAuthError(e) || attempt === 2) break;
          await wait(700 * (attempt + 1));
        }
      }
      if (lastAuthError) throw lastAuthError;
      if (!me) {
        clearStoredAuthState({ includeToken: true, reason: "auth_me_empty" });
        setUser(null);
        setAuthStatus("guest");
        return;
      }
      setUser(me);
      setAuthStatus("authenticated");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Не удалось восстановить сохранённую сессию.";
      // 5xx, перегрузка БД и сетевой таймаут не означают, что токен истёк.
      // Сохраняем его, чтобы временный сбой сервиса не выбрасывал пользователя
      // на форму входа. Реальные 401/419 уже очищаются внутри laravelAuthApi.me().
      if (!isTransientAuthError(e)) console.error("Laravel auth refresh failed", e);
      setUser(null);
      setAuthStatus("failed");
      setAuthError(message);
    } finally {
      setAuthReady(true);
      setLoading(false);
    }
  }, [failSession]);

  useEffect(() => {
    // Pick up a fresh token from Google OAuth callback (#access_token=...)
    const consumed = laravelAuthApi.consumeOauthToken();
    if (consumed.error) {
      // Динамический импорт чтобы не тянуть toast в auth-контекст напрямую
      import("sonner").then(({ toast }) => {
        toast.error("Ошибка входа через Google", {
          description: consumed.error,
        });
      }).catch(() => {
        console.error("OAuth error:", consumed.error);
      });
    }
    void refresh();

    // Cross-tab sync via storage events
    const onStorage = (e: StorageEvent) => {
      if (e.key === "laravel_token") void refresh();
    };
    const onExpired = () => {
      void clearSession("session_expired_event");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired);
    };
  }, [refresh, clearSession]);

  const signOut = useCallback(async () => {
    try {
      await laravelAuthApi.logout();
    } finally {
      await clearSession("sign_out");
    }
  }, [clearSession]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setAuthStatus("checking");
    setAuthError(null);
    try {
      const u = await laravelAuthApi.login(email, password);
      queryClient.clear();
      setUser(u);
      setAuthStatus("authenticated");
      setAuthReady(true);
      return u;
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  const completeTwoFactor = useCallback(async (challengeToken: string, code: string) => {
    setLoading(true);
    setAuthStatus("checking");
    setAuthError(null);
    try {
      const u = await laravelAuthApi.verifyTwoFactor(challengeToken, code);
      queryClient.clear();
      setUser(u);
      setAuthStatus("authenticated");
      setAuthReady(true);
      return u;
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  const signUp = useCallback(
    async (payload: Parameters<typeof laravelAuthApi.register>[0]) => {
      setLoading(true);
      setAuthStatus("checking");
      setAuthError(null);
      try {
        const u = await laravelAuthApi.register(payload);
        queryClient.clear();
        setUser(u);
        setAuthStatus("authenticated");
        setAuthReady(true);
        return u;
      } finally {
        setLoading(false);
      }
    },
    [queryClient],
  );

  const value = useMemo<LaravelAuthContextType>(() => {
    const token = laravelAuth.getToken();
    return {
      user,
      session: user && token ? { access_token: token, user } : null,
      loading,
      authReady,
      authStatus,
      authError,
      signOut,
      signInWithPassword,
      completeTwoFactor,
      signUp,
      signInWithGoogle: laravelAuthApi.signInWithGoogle,
      signInWithYandex: laravelAuthApi.signInWithYandex,
      refresh,
      clearSession,
    };
  }, [user, loading, authReady, authStatus, authError, signOut, signInWithPassword, completeTwoFactor, signUp, refresh, clearSession]);

  return <LaravelAuthContext.Provider value={value}>{children}</LaravelAuthContext.Provider>;
};
