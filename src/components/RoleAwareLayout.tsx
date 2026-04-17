import { useIsMobile } from "@/hooks/use-mobile";
import { usePrimaryRole } from "@/hooks/useUserProfile";
import AppLayout from "./AppLayout";
import MobileEmployeeLayout from "./MobileEmployeeLayout";

/**
 * Picks a layout based on role + viewport.
 * Employees on mobile (< 768px) get a dedicated mobile shell with bottom nav.
 * Everyone else uses the standard sidebar layout.
 */
const RoleAwareLayout = () => {
  const isMobile = useIsMobile();
  const role = usePrimaryRole();

  if (isMobile && role === "employee") {
    return <MobileEmployeeLayout />;
  }
  return <AppLayout />;
};

export default RoleAwareLayout;
