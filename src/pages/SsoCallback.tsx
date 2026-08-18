import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { laravelAuth } from "@/integrations/laravel/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Возврат из корпоративного IdP: токен приходит в hash-фрагменте
 * (#token=... | #error=...), чтобы не попадать в логи серверов.
 */
const SsoCallback = () => {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = params.get("token");
    const err = params.get("error");

    if (err || !token) {
      setError(err || "IdP не передал токен доступа.");
      return;
    }

    laravelAuth.setToken(token);
    window.history.replaceState(null, "", window.location.pathname);
    void refresh().finally(() => navigate("/dashboard", { replace: true }));
  }, [navigate, refresh]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground max-w-md">{error}</p>
        <Button onClick={() => navigate("/login", { replace: true })}>Вернуться ко входу</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
};

export default SsoCallback;
