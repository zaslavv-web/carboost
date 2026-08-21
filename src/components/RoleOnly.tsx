import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePrimaryRole } from "@/hooks/useUserProfile";

/**
 * Route guard: пускает только перечисленные роли (суперадмин — всегда).
 * Остальных мягко уводит на fallback вместо 403-ошибок в консоли.
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
  if (!role) return null;
  if (role === "superadmin" || roles.includes(role)) return <>{children}</>;
  return <Navigate to={fallback} replace />;
};

export default RoleOnly;
