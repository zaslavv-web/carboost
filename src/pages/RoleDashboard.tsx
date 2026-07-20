import { usePrimaryRole } from "@/hooks/useUserProfile";
import Dashboard from "@/pages/Dashboard";
import ManagerDashboard from "@/pages/ManagerDashboard";
import HRDDashboard from "@/pages/HRDDashboard";
import SuperadminDashboard from "@/pages/SuperadminDashboard";
import EmployeeToday from "@/pages/employee/EmployeeToday";

const RoleDashboard = () => {
  const role = usePrimaryRole();

  if (role === "superadmin") return <SuperadminDashboard />;
  if (role === "company_admin") return <HRDDashboard />;
  if (role === "hrd") return <HRDDashboard />;
  if (role === "manager") return <ManagerDashboard />;
  return <EmployeeToday />;
};

export default RoleDashboard;

// Legacy dashboard kept for reference / fallback.
export { Dashboard as EmployeeLegacyDashboard };
