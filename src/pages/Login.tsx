import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Mail, Lock, Eye, EyeOff, AlertCircle, X, Building2 } from "lucide-react";
import brandLogo from "@/assets/logo-growth-peak.png";
import LandingHeader from "@/components/landing/LandingHeader";
import { useAuth } from "@/contexts/AuthContext";
import { laravelAuthApi } from "@/integrations/laravel/auth";
import { laravelRpc } from "@/integrations/laravel/rpc";
import {
  clearPendingSocialSignup,
  ROLE_OPTIONS,
  savePendingSocialSignup,
  type RequestedAppRole,
} from "@/lib/pendingSocialSignup";
import { toast } from "sonner";

const oauthLog = (
  level: "info" | "warn" | "error",
  event: string,
  details: Record<string, unknown> = {},
) => {
  const ctx = {
    scope: "auth.oauth",
    event,
    host: typeof window !== "undefined" ? window.location.hostname : "ssr",
    origin: typeof window !== "undefined" ? window.location.origin : "ssr",
    mode: "laravelDb-direct",
    ts: new Date().toISOString(),
    ...details,
  };
  // eslint-disable-next-line no-console
  console[level](`[auth.oauth] ${event}`, ctx);
};

const Login = () => {
  const { t } = useTranslation(["auth", "common"]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RequestedAppRole>("employee");
  const [companyName, setCompanyName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();
  const { signInWithPassword, signUp, signInWithGoogle } = useAuth();

  const isHRD = selectedRole === "hrd";

  const translateError = (msg: string): string => {
    if (/SMTP|smtp|пароль приложения|Почтовые программы|расшифровывается/i.test(msg)) {
      return t("auth:errors.smtpFailed");
    }
    const map: Array<[RegExp | string, string]> = [
      ["Invalid login credentials", t("auth:errors.invalidCreds")],
      ["Email not confirmed", t("auth:errors.emailUnconfirmed")],
      ["User already registered", t("auth:errors.userExists")],
      ["Password should be at least 6 characters", t("auth:errors.passwordMin6")],
      ["Signup requires a valid password", t("auth:errors.invalidPassword")],
      ["Unable to validate email address: invalid format", t("auth:errors.invalidEmail")],
      ["For security purposes, you can only request this after", t("auth:errors.rateLimit")],
      ["Email rate limit exceeded", t("auth:errors.emailLimit")],
    ];
    for (const [needle, value] of map) {
      if (typeof needle === "string" ? msg.includes(needle) : needle.test(msg)) return value;
    }
    return msg;
  };

  const resolveCompanyId = async (): Promise<string> => {
    const trimmed = companyName.trim();
    if (trimmed.length < 2) throw new Error(t("auth:errors.companyShort"));
    if (trimmed.length > 120) throw new Error(t("auth:errors.companyLong"));

    if (isHRD) {
      const { data, error } = await laravelRpc("register_company", { _name: trimmed });
      if (error) throw new Error(error.message);
      if (!data) throw new Error(t("auth:errors.companyCreateFailed"));
      return data as string;
    }

    const { data, error } = await laravelRpc("find_company_by_name", { _name: trimmed });
    if (error) throw new Error(error.message);
    if (!data) throw new Error(t("auth:errors.companyNotFound"));
    return data as string;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");

    try {
      if (isSignUp) {
        const companyId = await resolveCompanyId();
        await signUp({
          email,
          password,
          full_name: email.split("@")[0],
          company_id: companyId,
          requested_role: selectedRole,
        });
        toast.success(t("auth:toast.registered"));
        navigate("/dashboard");
      } else {
        await signInWithPassword(email, password);
        navigate("/dashboard");
      }
    } catch (error: any) {
      setErrorMessage(translateError(error.message || t("auth:errors.generic")));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setErrorMessage(t("auth:errors.emailRequired"));
      return;
    }
    setErrorMessage("");
    try {
      await laravelAuthApi.resetPasswordForEmail(email, `${window.location.origin}/reset-password`);
      toast.success(t("auth:toast.resetSent", { email }));
    } catch (error: any) {
      setErrorMessage(translateError(error.message || t("auth:errors.resetFailed")));
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage("");

    if (isSignUp) {
      let companyId: string;
      try {
        companyId = await resolveCompanyId();
      } catch (error: any) {
        setErrorMessage(translateError(error.message || t("auth:errors.companyResolveFailed")));
        return;
      }
      savePendingSocialSignup({ companyId, requestedRole: selectedRole });
    } else {
      clearPendingSocialSignup();
    }

    const redirectTo = isSignUp
      ? `${window.location.origin}/complete-registration`
      : `${window.location.origin}/`;

    try {
      oauthLog("info", "start", { provider: "google", flow: isSignUp ? "signup" : "signin", redirectTo });
      signInWithGoogle(redirectTo);
      oauthLog("info", "redirected_to_provider", { provider: "google", via: "laravel" });
    } catch (e: any) {
      oauthLog("error", "unexpected_exception", { provider: "google", errorMessage: e?.message ?? String(e), errorName: e?.name ?? null });
      if (isSignUp) clearPendingSocialSignup();
      setErrorMessage(t("auth:errors.googleFailed"));
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <LandingHeader />
      <div className="flex-1 flex">
      <div className="hidden lg:flex lg:w-1/2 gradient-hero items-center justify-center p-12">
        <div className="max-w-md text-center">
          <img
            src={brandLogo}
            alt={t("common:brand.logoAlt")}
            width={96}
            height={96}
            className="w-24 h-24 mx-auto mb-8 object-contain drop-shadow-[0_8px_24px_rgba(212,175,55,0.35)]"
          />
          <h1 className="text-3xl font-bold text-primary-foreground mb-2">{t("auth:hero.title")}</h1>
          <p className="text-primary-foreground/60 text-xs tracking-[0.25em] uppercase mb-4">Growth Peak</p>
          <p className="text-primary-foreground/70 text-lg leading-relaxed">{t("auth:hero.subtitle")}</p>
          <div className="mt-12 grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-2xl font-bold text-primary-foreground">{t("auth:hero.kpiAI")}</p>
              <p className="text-xs text-primary-foreground/60 mt-1">{t("auth:hero.kpiAILabel")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-foreground">{t("auth:hero.kpi360")}</p>
              <p className="text-xs text-primary-foreground/60 mt-1">{t("auth:hero.kpi360Label")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-foreground">{t("auth:hero.kpi100")}</p>
              <p className="text-xs text-primary-foreground/60 mt-1">{t("auth:hero.kpi100Label")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <img src={brandLogo} alt={t("common:brand.logoAlt")} width={40} height={40} className="w-10 h-10 object-contain" />
            <div className="leading-tight">
              <span className="block font-bold text-base text-foreground">{t("common:brand.name")}</span>
              <span className="block text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Growth Peak</span>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-foreground">{isSignUp ? t("auth:header.signUp") : t("auth:header.signIn")}</h2>
          <p className="text-muted-foreground text-sm mt-2">
            {isSignUp ? t("auth:header.subtitleSignUp") : t("auth:header.subtitleSignIn")}
          </p>

          {errorMessage && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive flex-1">{errorMessage}</p>
              <button type="button" onClick={() => setErrorMessage("")} className="shrink-0">
                <X className="w-4 h-4 text-destructive/60 hover:text-destructive" />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label className="text-sm font-medium text-foreground">{t("auth:fields.email")}</label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrorMessage(""); }}
                  placeholder={t("auth:fields.emailPlaceholder")}
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">{t("auth:fields.password")}</label>
                {!isSignUp && (
                  <button type="button" onClick={handleForgotPassword} className="text-xs text-primary hover:underline">
                    {t("auth:buttons.forgot")}
                  </button>
                )}
              </div>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMessage(""); }}
                  placeholder={t("auth:fields.passwordPlaceholder")}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2">
                  {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
            </div>

            {isSignUp && (
              <>
                <div>
                  <label className="text-sm font-medium text-foreground">{t("auth:fields.desiredRole")}</label>
                  <select
                    value={selectedRole}
                    onChange={(e) => { setSelectedRole(e.target.value as RequestedAppRole); setErrorMessage(""); }}
                    className="w-full mt-1.5 px-4 py-2.5 rounded-lg border border-input bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{t(r.labelKey)}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">{t("auth:fields.roleHint")}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">
                    {isHRD ? t("auth:fields.companyNameHRD") : t("auth:fields.companyNameEmployee")}
                  </label>
                  <div className="relative mt-1.5">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => { setCompanyName(e.target.value); setErrorMessage(""); }}
                      placeholder={isHRD ? t("auth:fields.companyPlaceholderHRD") : t("auth:fields.companyPlaceholderEmployee")}
                      required
                      maxLength={120}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isHRD ? t("auth:fields.companyHintHRD") : t("auth:fields.companyHintEmployee")}
                  </p>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg gradient-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? t("auth:buttons.loading") : isSignUp ? t("auth:buttons.signUp") : t("auth:buttons.signIn")}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center"><span className="bg-background px-3 text-xs text-muted-foreground">{t("auth:buttons.or")}</span></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full py-2.5 rounded-lg border border-border bg-card text-foreground font-medium text-sm hover:bg-secondary transition-colors"
            >
              {isSignUp ? t("auth:buttons.googleSignUp") : t("auth:buttons.googleSignIn")}
            </button>

            <p className="text-center text-sm text-muted-foreground">
              {isSignUp ? t("auth:buttons.haveAccount") : t("auth:buttons.noAccount")}{" "}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setErrorMessage("");
                  if (isSignUp) clearPendingSocialSignup();
                }}
                className="text-primary hover:underline"
              >
                {isSignUp ? t("auth:buttons.signIn") : t("auth:buttons.signUp")}
              </button>
            </p>
          </form>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Login;
