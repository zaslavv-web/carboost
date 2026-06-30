import { useQuery } from "@tanstack/react-query";
import { laravel } from "@/integrations/laravel/client";
import { laravelDb } from "@/integrations/laravel/db";
import { useAuth } from "@/contexts/AuthContext";
import { useImpersonation } from "@/contexts/ImpersonationContext";

export type AppRole = "employee" | "manager" | "hrd" | "company_admin" | "superadmin";

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  position: string;
  department: string;
  avatar_url: string | null;
  hire_date: string | null;
  overall_score: number;
  role_readiness: number;
  is_verified: boolean;
  requested_role: string;
  company_id: string | null;
  position_id: string | null;
  pending_position_id: string | null;
}

/** Returns the effective user ID (impersonated or real) */
export const useEffectiveUserId = (): string | null => {
  const { user } = useAuth();
  const { impersonatedUserId } = useImpersonation();
  return impersonatedUserId || user?.id || null;
};

// Internal alias used inside this file.
const useEffectiveId = useEffectiveUserId;

export const useUserProfile = () => {
  const { user, authReady } = useAuth();
  const { impersonatedUserId, impersonatedProfile } = useImpersonation();
  const effectiveId = impersonatedUserId || user?.id || null;

  return useQuery({
    queryKey: ["profile", effectiveId],
    queryFn: async () => {
      if (!effectiveId) return null;
      if (impersonatedUserId && impersonatedProfile) {
        return impersonatedProfile as unknown as UserProfile;
      }
      if (!impersonatedUserId || effectiveId === user?.id) {
        const { data, error } = await laravel.get<UserProfile>("/profiles/me");
        if (error) {
          if (error.status === 404) return null;
          throw new Error(error.message);
        }
        return data as UserProfile | null;
      }
      const { data, error } = await laravelDb
        .from("profiles")
        .select("*")
        .eq("user_id", effectiveId)
        .maybeSingle();
      if (error) throw error;
      return data as UserProfile | null;
    },
    enabled: authReady && !!user && !!effectiveId,
  });
};

export const useUserRoles = () => {
  const effectiveId = useEffectiveId();
  const { user, authReady } = useAuth();
  const { impersonatedUserId, impersonatedRoles } = useImpersonation();

  return useQuery({
    queryKey: ["user_roles", effectiveId, impersonatedUserId],
    queryFn: async () => {
      if (!effectiveId) return [];
      if (impersonatedUserId && impersonatedRoles.length > 0) {
        return impersonatedRoles as AppRole[];
      }
      // With backend-issued impersonation tokens, `/auth/me` already returns
      // the impersonated user's roles via the EffectiveUser middleware, so
      // useAuth().user.roles is authoritative for both cases.
      if (effectiveId === user?.id && Array.isArray(user?.roles)) {
        return user.roles as AppRole[];
      }
      const { data, error } = await laravelDb
        .from("user_roles")
        .select("role")
        .eq("user_id", effectiveId);
      if (error) throw error;
      return (data || []).map((r) => r.role as AppRole);
    },
    enabled: authReady && !!user && !!effectiveId,
  });
};


export const usePrimaryRole = (): AppRole => {
  const { data: roles } = useUserRoles();
  if (!roles || roles.length === 0) return "employee";
  if (roles.includes("superadmin")) return "superadmin";
  if (roles.includes("company_admin")) return "company_admin";
  if (roles.includes("hrd")) return "hrd";
  if (roles.includes("manager")) return "manager";
  return "employee";
};

/** Returns the REAL authenticated user's role, ignoring impersonation */
export const useRealPrimaryRole = (): AppRole => {
  const { user } = useAuth();
  const { impersonatedUserId, originalUser } = useImpersonation();

  // While impersonating, useAuth().user is the target user (backend swap),
  // so fall back to the snapshot captured at impersonation start.
  const source = impersonatedUserId && originalUser ? originalUser.roles : user?.roles;
  const roles = Array.isArray(source) ? (source as AppRole[]) : [];

  if (!roles || roles.length === 0) return "employee";
  if (roles.includes("superadmin")) return "superadmin";
  if (roles.includes("company_admin")) return "company_admin";
  if (roles.includes("hrd")) return "hrd";
  if (roles.includes("manager")) return "manager";
  return "employee";
};


export const useAllProfiles = () => {
  return useQuery({
    queryKey: ["all_profiles"],
    queryFn: async () => {
      const { data, error } = await laravelDb.from("profiles").select("*");
      if (error) throw error;
      return data as UserProfile[];
    },
  });
};
