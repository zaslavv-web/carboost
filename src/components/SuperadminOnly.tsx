import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useRealPrimaryRole } from "@/hooks/useUserProfile";

/**
 * Route guard: разрешает доступ только пользователям с реальной ролью superadmin
 * (включая суперадмина в режиме импернсонации). Остальных редиректит на /dashboard.
 */
const SuperadminOnly = ({ children }: { children: ReactNode }) => {
  const realRole = useRealPrimaryRole();
  if (realRole !== "superadmin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

export default SuperadminOnly;
