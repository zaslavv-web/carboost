import { useAuth } from "@/contexts/AuthContext";
import { useImpersonation } from "@/contexts/ImpersonationContext";

/** Returns the effective user ID — impersonated or real */
export const useEffectiveUserId = (): string | null => {
  const { user } = useAuth();
  const { impersonatedUserId } = useImpersonation();
  return impersonatedUserId || user?.id || null;
};
