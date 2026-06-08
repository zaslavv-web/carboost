/**
 * Laravel-backed equivalents of useUserProfile / useUserRoles (Phase 9).
 *
 * Reads from `/api/profiles/me` and `/api/auth/me` (roles are returned inline
 * by AuthController::me). Same return shape as the existing hooks so callers
 * can swap imports without touching component code.
 */

import { useQuery } from "@tanstack/react-query";
import { laravel } from "@/integrations/laravel/client";
import { useLaravelAuth } from "@/contexts/LaravelAuthContext";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import type { AppRole, UserProfile } from "@/hooks/useUserProfile";

const ROLE_PRIORITY: AppRole[] = [
  "superadmin",
  "company_admin",
  "hrd",
  "manager",
  "employee",
];

const pickPrimary = (roles: AppRole[]): AppRole => {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
  return "employee";
};

export const useEffectiveLaravelUserId = (): string | null => {
  const { user } = useLaravelAuth();
  const { impersonatedUserId } = useImpersonation();
  return impersonatedUserId || user?.id || null;
};

export const useLaravelProfile = () => {
  const effectiveId = useEffectiveLaravelUserId();
  const { user } = useLaravelAuth();

  return useQuery({
    queryKey: ["laravel_profile", effectiveId],
    queryFn: async () => {
      if (!effectiveId) return null;
      // Без импер­сонации используем /profiles/me — он гарантированно
      // резолвит профиль текущего юзера через auth()->user() и не зависит
      // от того, что бэк ожидает в {id} (UUID vs domain user_id).
      const path =
        effectiveId && user?.id && effectiveId !== user.id
          ? `/profiles/${effectiveId}`
          : `/profiles/me`;
      const { data, error } = await laravel.get<UserProfile>(path);
      if (error) {
        if (error.status === 404) return null;
        throw new Error(error.message);
      }
      return data;
    },
    enabled: !!effectiveId,
  });
};

export const useLaravelRoles = () => {
  const effectiveId = useEffectiveLaravelUserId();
  const { user } = useLaravelAuth();

  return useQuery({
    queryKey: ["laravel_roles", effectiveId],
    queryFn: async () => {
      if (!effectiveId) return [] as AppRole[];

      // No impersonation → /auth/me already carries roles
      if (effectiveId === user?.id && Array.isArray(user.roles)) {
        return user.roles as AppRole[];
      }

      const { data, error } = await laravel.get<{ roles: AppRole[] }>(
        `/profiles/${effectiveId}`,
      );
      if (error) throw new Error(error.message);
      return (data?.roles ?? []) as AppRole[];
    },
    enabled: !!effectiveId,
  });
};

export const useLaravelPrimaryRole = (): AppRole => {
  const { data } = useLaravelRoles();
  return pickPrimary(data ?? []);
};

export const useRealLaravelPrimaryRole = (): AppRole => {
  const { user } = useLaravelAuth();
  return pickPrimary((user?.roles ?? []) as AppRole[]);
};
