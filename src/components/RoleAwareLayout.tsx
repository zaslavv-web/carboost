import { Navigate, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePrimaryRole } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "./AppLayout";
import MobileEmployeeLayout from "./MobileEmployeeLayout";
import MobileHrdLayout from "./MobileHrdLayout";
import HrdTodayLayout from "./hrd/HrdTodayLayout";
import FirstLoginModePicker from "./hrd/FirstLoginModePicker";
import ErrorBoundary from "./ErrorBoundary";
import { isTodayCanary, readHrdUiMode } from "@/lib/hrdUiMode";

/**
 * Picks a layout based on role + viewport AND enforces top-level route guards
 * that depend on the loaded role (so they can't be encoded as static <Route> guards).
 *
 *  - Employees on mobile (< 768px) get a dedicated mobile shell.
 *  - HRD on mobile get a Today-first mobile shell (mirrors the desktop Today mode).
 *  - Allowlisted HRDs in Today-mode get the streamlined Today shell on desktop.
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

  const hrdTodayEligible = role === "hrd" && isTodayCanary(user?.email);
  const mode = hrdTodayEligible ? readHrdUiMode() : null;

  // HRD on mobile with Today mode → Today shell on mobile, redirect /dashboard → /today.
  const isMobileHrdToday = isMobile && hrdTodayEligible && mode === "today";
  if (isMobileHrdToday && location.pathname === "/dashboard") {
    return <Navigate to="/today" replace />;
  }

  // HRD on desktop with Today mode → desktop Today shell, redirect /dashboard → /today.
  const isDesktopHrdToday = !isMobile && hrdTodayEligible && mode === "today";
  if (isDesktopHrdToday && location.pathname === "/dashboard") {
    return <Navigate to="/today" replace />;
  }

  const layout = isMobileHrdToday
    ? <MobileHrdLayout />
    : isDesktopHrdToday
      ? <HrdTodayLayout />
      : isMobile && role === "employee"
        ? <MobileEmployeeLayout />
        : <AppLayout />;

  return (
    <ErrorBoundary>
      {layout}
      {/* Canary mode picker: appears on first visit regardless of chosen shell. */}
      {hrdTodayEligible && mode === null && (
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

