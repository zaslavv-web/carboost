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
  clearStoredAuthState,
  isProbablyLaravelToken,
} from "@/lib/authStorage";

export interface LaravelSessionLike {
  access_token: string;
  user: LaravelUser;
}

interface LaravelAuthContextType {
  session: LaravelSessionLike | null;
  user: LaravelUser | null;
  loading: boolean;
  authReady: boolean;
  signOut: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<LaravelUser>;
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
  signOut: async () => {},
  signInWithPassword: stub as never,
  signUp: stub as never,
  signInWithGoogle: noop,
  signInWithYandex: noop,
  refresh: async () => {},
  clearSession: async () => {},
});

export const useLaravelAuth = () => useContext(LaravelAuthContext);

export const LaravelAuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<LaravelUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const queryClient = useQueryClient();

  const clearSession = useCallback(async (reason = "auth_reset") => {
    clearStoredAuthState({ includeToken: true, reason });
    setUser(null);
    setAuthReady(true);
    setLoading(false);
    queryClient.clear();
  }, [queryClient]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = laravelAuth.getToken();
      if (!token) {
        setUser(null);
        return;
      }
      if (!isProbablyLaravelToken(token)) {
        await clearSession("malformed_token");
        return;
      }
      const me = await laravelAuthApi.me();
      setUser(me);
    } catch (e) {
      // Сбрасываем потенциально протухший токен — иначе при каждом ребуте
      // приложение будет падать на /auth/me и зависать в loading=true, что
      // визуально выглядит как «чёрный экран при повторном входе».
      console.error("Laravel auth refresh failed", e);
      await clearSession("auth_refresh_failed");
    } finally {
      setAuthReady(true);
      setLoading(false);
    }
  }, [clearSession]);

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
    const u = await laravelAuthApi.login(email, password);
    queryClient.clear();
    setUser(u);
    setAuthReady(true);
    setLoading(false);
    return u;
  }, [queryClient]);

  const signUp = useCallback(
    async (payload: Parameters<typeof laravelAuthApi.register>[0]) => {
      setLoading(true);
      const u = await laravelAuthApi.register(payload);
      queryClient.clear();
      setUser(u);
      setAuthReady(true);
      setLoading(false);
      return u;
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
      signOut,
      signInWithPassword,
      signUp,
      signInWithGoogle: laravelAuthApi.signInWithGoogle,
      signInWithYandex: laravelAuthApi.signInWithYandex,
      refresh,
      clearSession,
    };
  }, [user, loading, authReady, signOut, signInWithPassword, signUp, refresh, clearSession]);

  return <LaravelAuthContext.Provider value={value}>{children}</LaravelAuthContext.Provider>;
};
