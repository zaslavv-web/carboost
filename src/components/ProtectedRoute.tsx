import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile, useRealPrimaryRole } from "@/hooks/useUserProfile";
import { ShieldAlert } from "lucide-react";

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { session, loading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useUserProfile();
  const realRole = useRealPrimaryRole();
  const location = useLocation();

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const needsCompanyAssignment = realRole !== "superadmin" && !profile?.company_id;

  if (needsCompanyAssignment && location.pathname !== "/complete-registration") {
    return <Navigate to="/complete-registration" replace />;
  }

  if (!needsCompanyAssignment && location.pathname === "/complete-registration") {
    return <Navigate to="/" replace />;
  }

  if (realRole === "superadmin") {
    return <>{children}</>;
  }

  // Non-verified users see a waiting screen
  if (profile && !profile.is_verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8 text-warning" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Ожидание верификации</h2>
          <p className="text-muted-foreground text-sm">
            Ваша регистрация ожидает подтверждения суперадмином. Вы получите доступ к системе после верификации.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Проверить статус
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
