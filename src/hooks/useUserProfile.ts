import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "employee" | "manager" | "hrd" | "superadmin";

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
}

export const useUserProfile = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data as UserProfile;
    },
    enabled: !!user,
  });
};

export const useUserRoles = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user_roles", user?.id],
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
};

export const usePrimaryRole = (): AppRole => {
  const { data: roles } = useUserRoles();
  if (!roles || roles.length === 0) return "employee";
  if (roles.includes("superadmin")) return "superadmin";
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
