import { Navigate, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePrimaryRole } from "@/hooks/useUserProfile";
import AppLayout from "./AppLayout";
import MobileEmployeeLayout from "./MobileEmployeeLayout";
import ErrorBoundary from "./ErrorBoundary";

/**
 * Picks a layout based on role + viewport AND enforces top-level route guards
 * that depend on the loaded role (so they can't be encoded as static <Route> guards).
 *
 *  - Employees on mobile (< 768px) get a dedicated mobile shell.
 *  - `/users` is admin-only — HRD / managers / employees are redirected to /dashboard.
 *  - For HRD/admin, `/employees` is folded into `/dashboard` (single rich screen).
 *
 * Everything is wrapped in ErrorBoundary so a single broken page doesn't blank
 * the app — critical on mobile where there are no devtools.
 */
const RoleAwareLayout = () => {
  const isMobile = useIsMobile();
  const role = usePrimaryRole();
  const location = useLocation();

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

  const layout =
    isMobile && role === "employee" ? <MobileEmployeeLayout /> : <AppLayout />;

  return <ErrorBoundary>{layout}</ErrorBoundary>;
};

export default RoleAwareLayout;
