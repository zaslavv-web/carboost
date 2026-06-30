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
import { laravelAuthApi, type LaravelUser } from "@/integrations/laravel/auth";
import { laravelAuth } from "@/integrations/laravel/client";

export interface LaravelSessionLike {
  access_token: string;
  user: LaravelUser;
}

interface LaravelAuthContextType {
  session: LaravelSessionLike | null;
  user: LaravelUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<LaravelUser>;
  signUp: (payload: Parameters<typeof laravelAuthApi.register>[0]) => Promise<LaravelUser>;
  signInWithGoogle: (redirectTo?: string) => void;
  signInWithYandex: (redirectTo?: string) => void;
  refresh: () => Promise<void>;
}

const noop = () => {};
const stub = async () => {
  throw new Error("LaravelAuthProvider is not mounted");
};

const LaravelAuthContext = createContext<LaravelAuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
  signInWithPassword: stub as never,
  signUp: stub as never,
  signInWithGoogle: noop,
  signInWithYandex: noop,
  refresh: async () => {},
});

export const useLaravelAuth = () => useContext(LaravelAuthContext);

export const LaravelAuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<LaravelUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await laravelAuthApi.me();
      setUser(me);
    } catch (e) {
      // Сбрасываем потенциально протухший токен — иначе при каждом ребуте
      // приложение будет падать на /auth/me и зависать в loading=true, что
      // визуально выглядит как «чёрный экран при повторном входе».
      console.error("Laravel auth refresh failed", e);
      try { localStorage.removeItem("laravel_token"); } catch { /* ignore */ }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

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
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await laravelAuthApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const u = await laravelAuthApi.login(email, password);
    setUser(u);
    return u;
  }, []);

  const signUp = useCallback(
    async (payload: Parameters<typeof laravelAuthApi.register>[0]) => {
      const u = await laravelAuthApi.register(payload);
      setUser(u);
      return u;
    },
    [],
  );

  const value = useMemo<LaravelAuthContextType>(() => {
    const token = laravelAuth.getToken();
    return {
      user,
      session: user && token ? { access_token: token, user } : null,
      loading,
      signOut,
      signInWithPassword,
      signUp,
      signInWithGoogle: laravelAuthApi.signInWithGoogle,
      signInWithYandex: laravelAuthApi.signInWithYandex,
      refresh,
    };
  }, [user, loading, signOut, signInWithPassword, signUp, refresh]);

  return <LaravelAuthContext.Provider value={value}>{children}</LaravelAuthContext.Provider>;
};
