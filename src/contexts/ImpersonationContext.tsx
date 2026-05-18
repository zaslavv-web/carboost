import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { laravelAuth } from "@/integrations/laravel/client";
import { laravelAuthApi } from "@/integrations/laravel/auth";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const IMPERSONATION_USER_ID_KEY = "impersonatedUserId";
const IMPERSONATION_NAME_KEY = "impersonatedName";
const IMPERSONATION_ROLES_KEY = "impersonatedRoles";
const IMPERSONATION_PROFILE_KEY = "impersonatedProfile";
const ORIGINAL_TOKEN_KEY = "impersonationOriginalToken";
const ORIGINAL_USER_KEY = "impersonationOriginalUser";

export interface OriginalUserSnapshot {
  id: string;
  roles: string[];
  full_name?: string | null;
  email?: string | null;
}

interface ImpersonationContextType {
  impersonatedUserId: string | null;
  impersonatedName: string | null;
  impersonatedRoles: string[];
  impersonatedProfile: Record<string, unknown> | null;
  originalUser: OriginalUserSnapshot | null;
  startImpersonation: (userId: string, name: string, snapshot?: { roles?: string[]; profile?: Record<string, unknown> | null }) => Promise<void>;
  stopImpersonation: () => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextType>({
  impersonatedUserId: null,
  impersonatedName: null,
  impersonatedRoles: [],
  impersonatedProfile: null,
  originalUser: null,
  startImpersonation: async () => {},
  stopImpersonation: async () => {},
});

export const useImpersonation = () => useContext(ImpersonationContext);

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const readOriginalUser = (): OriginalUserSnapshot | null => {
  return readJson<OriginalUserSnapshot | null>(ORIGINAL_USER_KEY, null);
};

export const ImpersonationProvider = ({ children }: { children: ReactNode }) => {
  const [impersonatedUserId, setUserId] = useState<string | null>(() => sessionStorage.getItem(IMPERSONATION_USER_ID_KEY));
  const [impersonatedName, setName] = useState<string | null>(() => sessionStorage.getItem(IMPERSONATION_NAME_KEY));
  const [impersonatedRoles, setRoles] = useState<string[]>(() => readJson<string[]>(IMPERSONATION_ROLES_KEY, []));
  const [impersonatedProfile, setProfile] = useState<Record<string, unknown> | null>(() => readJson<Record<string, unknown> | null>(IMPERSONATION_PROFILE_KEY, null));
  const [originalUser, setOriginalUser] = useState<OriginalUserSnapshot | null>(() => readOriginalUser());
  const queryClient = useQueryClient();
  const { refresh, user } = useAuth();

  const startImpersonation = useCallback(async (userId: string, name: string, targetSnapshot?: { roles?: string[]; profile?: Record<string, unknown> | null }) => {
    try {
      // Save current (superadmin) token so we can restore it on stop.
      const originalToken = laravelAuth.getToken();
      const originalSnapshot: OriginalUserSnapshot | null = user
        ? {
            id: user.id,
            roles: Array.isArray(user.roles) ? (user.roles as string[]) : [],
            full_name: (user.full_name as string | null) ?? null,
            email: user.email ?? null,
          }
        : null;
      if (originalToken) sessionStorage.setItem(ORIGINAL_TOKEN_KEY, originalToken);
      if (originalSnapshot) sessionStorage.setItem(ORIGINAL_USER_KEY, JSON.stringify(originalSnapshot));

      await laravelAuthApi.startImpersonation(userId);

      sessionStorage.setItem(IMPERSONATION_USER_ID_KEY, userId);
      sessionStorage.setItem(IMPERSONATION_NAME_KEY, name);
      sessionStorage.setItem(IMPERSONATION_ROLES_KEY, JSON.stringify(targetSnapshot?.roles ?? []));
      if (targetSnapshot?.profile) sessionStorage.setItem(IMPERSONATION_PROFILE_KEY, JSON.stringify(targetSnapshot.profile));
      else sessionStorage.removeItem(IMPERSONATION_PROFILE_KEY);
      setUserId(userId);
      setName(name);
      setRoles(targetSnapshot?.roles ?? []);
      setProfile(targetSnapshot?.profile ?? null);
      setOriginalUser(originalSnapshot);

      await queryClient.invalidateQueries();
    } catch (e: any) {
      // Roll back partial state.
      const original = sessionStorage.getItem(ORIGINAL_TOKEN_KEY);
      if (original) laravelAuth.setToken(original);
      sessionStorage.removeItem(ORIGINAL_TOKEN_KEY);
      sessionStorage.removeItem(ORIGINAL_USER_KEY);
      sessionStorage.removeItem(IMPERSONATION_USER_ID_KEY);
      sessionStorage.removeItem(IMPERSONATION_NAME_KEY);
      sessionStorage.removeItem(IMPERSONATION_ROLES_KEY);
      sessionStorage.removeItem(IMPERSONATION_PROFILE_KEY);
      setUserId(null);
      setName(null);
      setRoles([]);
      setProfile(null);
      setOriginalUser(null);
      toast.error(e?.message || "Не удалось войти под пользователем");
      throw e;
    }
  }, [queryClient, refresh, user]);

  const stopImpersonation = useCallback(async () => {
    try {
      await laravelAuthApi.stopImpersonation();
    } finally {
      const original = sessionStorage.getItem(ORIGINAL_TOKEN_KEY);
      laravelAuth.setToken(original);
      sessionStorage.removeItem(ORIGINAL_TOKEN_KEY);
      sessionStorage.removeItem(ORIGINAL_USER_KEY);
      sessionStorage.removeItem(IMPERSONATION_USER_ID_KEY);
      sessionStorage.removeItem(IMPERSONATION_NAME_KEY);
      sessionStorage.removeItem(IMPERSONATION_ROLES_KEY);
      sessionStorage.removeItem(IMPERSONATION_PROFILE_KEY);
      setUserId(null);
      setName(null);
      setRoles([]);
      setProfile(null);
      setOriginalUser(null);
      await queryClient.invalidateQueries();
    }
  }, [queryClient, refresh]);

  return (
    <ImpersonationContext.Provider
      value={{ impersonatedUserId, impersonatedName, impersonatedRoles, impersonatedProfile, originalUser, startImpersonation, stopImpersonation }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
};
