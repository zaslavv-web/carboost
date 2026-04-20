import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  const effectiveId = useEffectiveId();

  return useQuery({
    queryKey: ["profile", effectiveId],
    queryFn: async () => {
      if (!effectiveId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", effectiveId)
        .maybeSingle();
      if (error) throw error;
      return data as UserProfile | null;
    },
    enabled: !!effectiveId,
  });
};

export const useUserRoles = () => {
  const effectiveId = useEffectiveId();

  return useQuery({
    queryKey: ["user_roles", effectiveId],
    queryFn: async () => {
      if (!effectiveId) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", effectiveId);
      if (error) throw error;
      return (data || []).map((r) => r.role as AppRole);
    },
    enabled: !!effectiveId,
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

  const { data: roles } = useQuery({
    queryKey: ["real_user_roles", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data || []).map((r) => r.role as AppRole);
    },
    enabled: !!user,
  });

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
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data as UserProfile[];
    },
  });
};
