import { Navigate, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePrimaryRole } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "./AppLayout";
import MobileEmployeeLayout from "./MobileEmployeeLayout";
import HrdTodayLayout from "./hrd/HrdTodayLayout";
import FirstLoginModePicker from "./hrd/FirstLoginModePicker";
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

  const isHrdCanary = role === "hrd" && !isMobile && isTodayCanary(user?.email);
  const mode = isHrdCanary ? readHrdUiMode() : null;

  // Canary HRD on /dashboard with Today mode → redirect to /today.
  if (isHrdCanary && mode === "today" && location.pathname === "/dashboard") {
    return <Navigate to="/today" replace />;
  }

  const layout = isHrdCanary && mode === "today"
    ? <HrdTodayLayout />
    : isMobile && role === "employee"
      ? <MobileEmployeeLayout />
      : <AppLayout />;

  return (
    <ErrorBoundary>
      {layout}
      {/* Canary mode picker: appears on first visit regardless of chosen shell. */}
      {isHrdCanary && mode === null && (
        <FirstLoginModePicker
          onPick={(picked) => {
            if (picked === "today") window.location.href = "/today";
            else window.location.reload();
          }}
        />
      )}
    </ErrorBoundary>
  );
};

export default RoleAwareLayout;
