import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePrimaryRole, useRolesReady } from "@/hooks/useUserProfile";

/**
 * Route guard: пускает только перечисленные роли (суперадмин — всегда).
 * Остальных мягко уводит на fallback вместо 403-ошибок в консоли.
 *
 * Важно: пока роли не загружены, `usePrimaryRole()` отдаёт дефолтный
 * "employee". Раньше это приводило к ложным редиректам (HRD выкидывало
 * с /employee-map на /dashboard), поэтому ждём готовности ролей.
 */
const RoleOnly = ({
  roles,
  fallback = "/dashboard",
  children,
}: {
  roles: string[];
  fallback?: string;
  children: ReactNode;
}) => {
  const role = usePrimaryRole();
  const ready = useRolesReady();
  if (!ready || !role) return null;
  if (role === "superadmin" || roles.includes(role)) return <>{children}</>;
  return <Navigate to={fallback} replace />;
};

export default RoleOnly;
