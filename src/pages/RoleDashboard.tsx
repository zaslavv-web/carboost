import { usePrimaryRole } from "@/hooks/useUserProfile";
import Dashboard from "@/pages/Dashboard";
import ManagerDashboard from "@/pages/ManagerDashboard";
import HRDDashboard from "@/pages/HRDDashboard";
import SuperadminDashboard from "@/pages/SuperadminDashboard";

const RoleDashboard = () => {
  const role = usePrimaryRole();

  if (role === "superadmin") return <SuperadminDashboard />;
  if (role === "hrd") return <HRDDashboard />;
  if (role === "manager") return <ManagerDashboard />;
  return <Dashboard />;
};

export default RoleDashboard;
