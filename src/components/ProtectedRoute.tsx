import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile, useRealPrimaryRole } from "@/hooks/useUserProfile";
import { ShieldAlert } from "lucide-react";

const STUCK_AFTER_MS = 15000;

/** Спиннер, который через 15 секунд превращается в понятный экран ошибки. */
const LoadingGate = ({
  label,
  onRetry,
  onReset,
}: {
  label: string;
  onRetry: () => void;
  onReset: () => void;
}) => {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setStuck(true), STUCK_AFTER_MS);
    return () => window.clearTimeout(id);
  }, []);

  if (stuck) {
    return (
      <FailureScreen
        title="Не удалось загрузить кабинет"
        description="Сервер не ответил вовремя. Попробуйте повторить или войдите заново."
        onRetry={onRetry}
        onReset={onReset}
      />
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-center px-6">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
};

const FailureScreen = ({
  title,
  description,
  onRetry,
  onReset,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
  onReset: () => void;
}) => (
  <div className="min-h-dvh flex items-center justify-center bg-background p-6">
    <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 text-center space-y-4 shadow-elevated">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
        <ShieldAlert className="w-7 h-7 text-destructive" />
      </div>
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground break-words">{description}</p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Повторить
          </button>
        )}
        <button
          onClick={onReset}
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
        >
          Выйти и войти заново
        </button>
      </div>
    </div>
  </div>
);

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { session, loading, authStatus, authError, clearSession } = useAuth();
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    error: profileErrorObj,
    refetch: refetchProfile,
  } = useUserProfile();
  const realRole = useRealPrimaryRole();
  const location = useLocation();
  const { t } = useTranslation();

  const resetSession = () => {
    void clearSession("manual_session_recovery").finally(() => {
      window.location.assign("/login");
    });
  };

  if (loading) {
    return (
      <LoadingGate
        label="Восстанавливаем сессию…"
        onRetry={() => window.location.reload()}
        onReset={resetSession}
      />
    );
  }

  if (authStatus === "failed") {
    return (
      <FailureScreen
        title="Сессия не восстановилась"
        description={authError || "Сохранённые данные входа повреждены или устарели."}
        onReset={resetSession}
      />
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (profileLoading) {
    return (
      <LoadingGate
        label="Загружаем личный кабинет…"
        onRetry={() => void refetchProfile()}
        onReset={resetSession}
      />
    );
  }

  if (profileError) {
    return (
      <FailureScreen
        title="Профиль не загрузился"
        description={
          profileErrorObj instanceof Error
            ? profileErrorObj.message
            : "Сервер вернул ошибку при загрузке профиля."
        }
        onRetry={() => void refetchProfile()}
        onReset={resetSession}
      />
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
      <div className="min-h-dvh flex items-center justify-center bg-background p-8">
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
