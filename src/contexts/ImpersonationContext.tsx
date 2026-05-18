import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { laravelAuth } from "@/integrations/laravel/client";
import { laravelAuthApi } from "@/integrations/laravel/auth";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const IMPERSONATION_USER_ID_KEY = "impersonatedUserId";
const IMPERSONATION_NAME_KEY = "impersonatedName";
const ORIGINAL_TOKEN_KEY = "impersonationOriginalToken";

interface ImpersonationContextType {
  impersonatedUserId: string | null;
  impersonatedName: string | null;
  startImpersonation: (userId: string, name: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextType>({
  impersonatedUserId: null,
  impersonatedName: null,
  startImpersonation: async () => {},
  stopImpersonation: async () => {},
});

export const useImpersonation = () => useContext(ImpersonationContext);

export const ImpersonationProvider = ({ children }: { children: ReactNode }) => {
  const [impersonatedUserId, setUserId] = useState<string | null>(() => sessionStorage.getItem(IMPERSONATION_USER_ID_KEY));
  const [impersonatedName, setName] = useState<string | null>(() => sessionStorage.getItem(IMPERSONATION_NAME_KEY));
  const queryClient = useQueryClient();
  const { refresh } = useAuth();

  const startImpersonation = useCallback(async (userId: string, name: string) => {
    try {
      // Save current (superadmin) token so we can restore it on stop.
      const originalToken = laravelAuth.getToken();
      if (originalToken) {
        sessionStorage.setItem(ORIGINAL_TOKEN_KEY, originalToken);
      }

      const { token } = await laravelAuthApi.startImpersonation(userId);

      // Swap to impersonation token. EffectiveUser middleware on the backend
      // will now resolve auth()->user() to the target user, so /auth/me and
      // all role/profile queries return HRD/Manager/etc. data.
      laravelAuth.setToken(token);

      sessionStorage.setItem(IMPERSONATION_USER_ID_KEY, userId);
      sessionStorage.setItem(IMPERSONATION_NAME_KEY, name);
      setUserId(userId);
      setName(name);

      await refresh();
      await queryClient.invalidateQueries();
    } catch (e: any) {
      // Roll back partial state.
      const original = sessionStorage.getItem(ORIGINAL_TOKEN_KEY);
      if (original) laravelAuth.setToken(original);
      sessionStorage.removeItem(ORIGINAL_TOKEN_KEY);
      sessionStorage.removeItem(IMPERSONATION_USER_ID_KEY);
      sessionStorage.removeItem(IMPERSONATION_NAME_KEY);
      setUserId(null);
      setName(null);
      toast.error(e?.message || "Не удалось войти под пользователем");
      throw e;
    }
  }, [queryClient, refresh]);

  const stopImpersonation = useCallback(async () => {
    try {
      // Revoke impersonation token on the backend (best-effort).
      await laravelAuthApi.stopImpersonation();
    } finally {
      const original = sessionStorage.getItem(ORIGINAL_TOKEN_KEY);
      laravelAuth.setToken(original);
      sessionStorage.removeItem(ORIGINAL_TOKEN_KEY);
      sessionStorage.removeItem(IMPERSONATION_USER_ID_KEY);
      sessionStorage.removeItem(IMPERSONATION_NAME_KEY);
      setUserId(null);
      setName(null);
      await refresh();
      await queryClient.invalidateQueries();
    }
  }, [queryClient, refresh]);

  return (
    <ImpersonationContext.Provider value={{ impersonatedUserId, impersonatedName, startImpersonation, stopImpersonation }}>
      {children}
    </ImpersonationContext.Provider>
  );
};
