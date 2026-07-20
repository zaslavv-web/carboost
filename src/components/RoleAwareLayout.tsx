import { Navigate, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePrimaryRole } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "./AppLayout";
import MobileEmployeeLayout from "./MobileEmployeeLayout";
import HrdTodayLayout from "./hrd/HrdTodayLayout";
import ErrorBoundary from "./ErrorBoundary";
import { isTodayCanary, readHrdUiMode } from "@/lib/hrdUiMode";

/**
 * Picks a layout based on role + viewport AND enforces top-level route guards
 * that depend on the loaded role (so they can't be encoded as static <Route> guards).
 *
 *  - Employees on mobile (< 768px) get a dedicated mobile shell.
 *  - Allowlisted HRDs in Today-mode get the streamlined Today shell.
 *  - `/users` is admin-only — HRD / managers / employees are redirected to /dashboard.
 *  - For HRD/admin, `/employees` is folded into `/dashboard` (single rich screen).
 */
const RoleAwareLayout = () => {
  const isMobile = useIsMobile();
  const role = usePrimaryRole();
  const location = useLocation();
  const { user } = useAuth();

  // Restrict /users to platform admins. HRD now manages people via /dashboard.
  const isAdminOnly = location.pathname.startsWith("/users");
  if (isAdminOnly && role && role !== "superadmin" && role !== "company_admin") {
    return <Navigate to="/dashboard" replace />;
  }

  // Merge /employees into /dashboard for HRD-level roles — one canonical screen.
  const isEmployeesRoute = location.pathname === "/employees";
  if (isEmployeesRoute && (role === "hrd" || role === "company_admin" || role === "superadmin")) {
    return <Navigate to="/dashboard" replace />;
  }

  // Canary Today-mode for allowlisted HRDs. Mobile employees keep their shell.
  const canaryTodayHrd =
    role === "hrd" &&
    !isMobile &&
    isTodayCanary(user?.email) &&
    readHrdUiMode() === "today";

  const layout = canaryTodayHrd
    ? <HrdTodayLayout />
    : isMobile && role === "employee"
      ? <MobileEmployeeLayout />
      : <AppLayout />;

  return <ErrorBoundary>{layout}</ErrorBoundary>;
};

export default RoleAwareLayout;
