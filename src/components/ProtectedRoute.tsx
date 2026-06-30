import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile, useRealPrimaryRole } from "@/hooks/useUserProfile";
import { ShieldAlert } from "lucide-react";

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { session, loading, authStatus, authError, clearSession } = useAuth();
  const { data: profile, isLoading: profileLoading } = useUserProfile();
  const realRole = useRealPrimaryRole();
  const location = useLocation();
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Восстанавливаем сессию…</p>
        </div>
      </div>
    );
  }

  if (authStatus === "failed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 text-center space-y-4 shadow-elevated">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7 text-destructive" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Сессия не восстановилась</h1>
          <p className="text-sm text-muted-foreground break-words">
            {authError || "Сохранённые данные входа повреждены или устарели."}
          </p>
          <button
            onClick={() => {
              void clearSession("manual_session_recovery").finally(() => {
                window.location.assign("/login");
              });
            }}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Очистить сессию и войти заново
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Загружаем личный кабинет…</p>
        </div>
      </div>
    );
  }

  const needsCompanyAssignment = realRole !== "superadmin" && !profile?.company_id;

  if (needsCompanyAssignment && location.pathname !== "/complete-registration") {
    return <Navigate to="/complete-registration" replace />;
  }

  if (!needsCompanyAssignment && location.pathname === "/complete-registration") {
    return <Navigate to="/dashboard" replace />;
  }

  if (realRole === "superadmin") {
    return <>{children}</>;
  }

  if (profile && !profile.is_verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8 text-warning" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{t("verification.title")}</h2>
          <p className="text-muted-foreground text-sm">
            {t("verification.description")}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {t("verification.checkStatus")}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
