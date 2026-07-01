import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock, Eye, EyeOff, AlertTriangle } from "lucide-react";
import brandLogo from "@/assets/logo-growth-peak.png";
import { laravelAuthApi } from "@/integrations/laravel/auth";
import { toast } from "sonner";

const ResetPassword = () => {
  const { t } = useTranslation(["auth", "common"]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expiredError, setExpiredError] = useState<string | null>(null);

  const [params] = useSearchParams();
  const navigate = useNavigate();

  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const isRecovery = !!token && !!email;

  useEffect(() => {
    if (!isRecovery) return;
  }, [isRecovery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error(t("auth:errors.passwordsNoMatch"));
      return;
    }
    if (password.length < 8) {
      toast.error(t("auth:errors.passwordTooShort"));
      return;
    }

    setLoading(true);
    try {
      await laravelAuthApi.updatePassword({ token, email, password });
      toast.success(t("auth:toast.passwordUpdated"));
      navigate("/login");
    } catch (error: any) {
      const code: string | undefined = error?.code;
      if (code === "token_invalid_or_expired") {
        setExpiredError(t("auth:reset.expiredText"));
      } else if (code === "throttled") {
        toast.error(t("auth:reset.throttledText"));
      } else {
        toast.error(error?.message || t("auth:errors.updateFailed"));
      }
    } finally {
      setLoading(false);
    }
  };

  if (expiredError) {
    const forgotHref = `/login?forgot=1${email ? `&email=${encodeURIComponent(email)}` : ""}`;
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm text-center">
          <div className="w-12 h-12 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">{t("auth:reset.expiredTitle")}</h2>
          <p className="text-muted-foreground text-sm mb-6">{expiredError}</p>
          <button
            onClick={() => navigate(forgotHref)}
            className="w-full py-2.5 rounded-lg gradient-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
          >
            {t("auth:reset.requestNewCta")}
          </button>
          <button onClick={() => navigate("/login")} className="mt-4 text-primary hover:underline text-sm">
            {t("auth:buttons.backToLogin")}
          </button>
        </div>
      </div>
    );
  }


  if (!isRecovery) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm text-center">
          <img src={brandLogo} alt={t("common:brand.logoAlt")} width={48} height={48} className="w-12 h-12 mx-auto mb-6 object-contain" />
          <h2 className="text-xl font-bold text-foreground mb-2">{t("auth:reset.invalidLinkTitle")}</h2>
          <p className="text-muted-foreground text-sm mb-6">{t("auth:reset.invalidLinkText")}</p>
          <button onClick={() => navigate("/login")} className="text-primary hover:underline text-sm">
            {t("auth:buttons.backToLogin")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <img src={brandLogo} alt={t("common:brand.logoAlt")} width={40} height={40} className="w-10 h-10 object-contain" />
          <div className="leading-tight">
            <span className="block font-bold text-base text-foreground">{t("common:brand.name")}</span>
            <span className="block text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Growth Peak</span>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-foreground">{t("auth:reset.title")}</h2>
        <p className="text-muted-foreground text-sm mt-2">{t("auth:reset.subtitle", { email })}</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="text-sm font-medium text-foreground">{t("auth:fields.newPassword")}</label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth:fields.passwordPlaceholder")}
                required
                minLength={8}
                className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2">
                {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">{t("auth:fields.confirmPassword")}</label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("auth:fields.passwordPlaceholder")}
                required
                minLength={8}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg gradient-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? t("auth:reset.submitting") : t("auth:reset.submit")}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            <button type="button" onClick={() => navigate("/login")} className="text-primary hover:underline">
              {t("auth:buttons.backToLogin")}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
