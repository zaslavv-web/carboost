import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Mail, Lock, Eye, EyeOff, AlertCircle, X, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import {
  clearPendingSocialSignup,
  ROLE_OPTIONS,
  savePendingSocialSignup,
  type RequestedAppRole,
} from "@/lib/pendingSocialSignup";
import { toast } from "sonner";

const translateError = (msg: string): string => {
  const map: Record<string, string> = {
    "Invalid login credentials": "Неверный email или пароль. Проверьте данные и попробуйте снова.",
    "Email not confirmed": "Email не подтверждён. Проверьте почту для подтверждения.",
    "User already registered": "Пользователь с таким email уже зарегистрирован.",
    "Password should be at least 6 characters": "Пароль должен содержать минимум 6 символов.",
    "Signup requires a valid password": "Введите корректный пароль.",
    "Unable to validate email address: invalid format": "Некорректный формат email.",
    "For security purposes, you can only request this after": "Из соображений безопасности повторный запрос возможен через некоторое время.",
    "Email rate limit exceeded": "Превышен лимит отправки писем. Попробуйте позже.",
  };
  for (const [key, value] of Object.entries(map)) {
    if (msg.includes(key)) return value;
  }
  return msg;
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RequestedAppRole>("employee");
  const [companyName, setCompanyName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();

  const isHRD = selectedRole === "hrd";

  /** Returns company UUID. Creates new company for HRD, finds existing for others. */
  const resolveCompanyId = async (): Promise<string> => {
    const trimmed = companyName.trim();
    if (trimmed.length < 2) {
      throw new Error("Введите название компании (минимум 2 символа)");
    }
    if (trimmed.length > 120) {
      throw new Error("Название компании слишком длинное");
    }

    if (isHRD) {
      const { data, error } = await supabase.rpc("register_company", { _name: trimmed });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Не удалось создать компанию");
      return data as string;
    }

    const { data, error } = await supabase.rpc("find_company_by_name", { _name: trimmed });
    if (error) throw new Error(error.message);
    if (!data) {
      throw new Error("Компания не найдена. Попросите HRD вашей компании зарегистрироваться первым.");
    }
    return data as string;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");

    try {
      if (isSignUp) {
        const companyId = await resolveCompanyId();

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { requested_role: selectedRole, company_id: companyId },
          },
        });
        if (error) throw error;

        const identities = (data.user as any)?.identities;
        if (data.user && Array.isArray(identities) && identities.length === 0) {
          setErrorMessage(
            "Этот email уже зарегистрирован. Войдите в систему или восстановите пароль."
          );
          return;
        }

        if (data.session) {
          toast.success("Регистрация прошла успешно. Ожидайте подтверждения суперадмина.");
          navigate("/");
        } else {
          toast.success(`Письмо для подтверждения отправлено на ${email}. Проверьте папку «Спам».`);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      }
    } catch (error: any) {
      const translated = translateError(error.message || "Ошибка авторизации");
      setErrorMessage(translated);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setErrorMessage("Введите email для восстановления пароля");
      return;
    }
    setErrorMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Письмо для сброса пароля отправлено на " + email);
    } catch (error: any) {
      setErrorMessage(translateError(error.message || "Ошибка отправки письма"));
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage("");

    if (isSignUp) {
      let companyId: string;
      try {
        companyId = await resolveCompanyId();
      } catch (error: any) {
        setErrorMessage(translateError(error.message || "Не удалось определить компанию"));
        return;
      }

      savePendingSocialSignup({
        companyId,
        requestedRole: selectedRole,
      });
    } else {
      clearPendingSocialSignup();
    }

    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: isSignUp ? `${window.location.origin}/complete-registration` : window.location.origin,
      extraParams: {
        prompt: "select_account",
      },
    });

    if (result.error) {
      if (isSignUp) clearPendingSocialSignup();
      setErrorMessage("Ошибка входа через Google");
      return;
    }

    if (result.redirected) return;
    navigate(isSignUp ? "/complete-registration" : "/");
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 gradient-hero items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-8">
            <Briefcase className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-primary-foreground mb-4">Карьерный трек</h1>
          <p className="text-primary-foreground/70 text-lg leading-relaxed">
            Платформа интеллектуального управления развитием и мотивацией персонала
          </p>
          <div className="mt-12 grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-2xl font-bold text-primary-foreground">AI</p>
              <p className="text-xs text-primary-foreground/60 mt-1">Оценка компетенций</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-foreground">360°</p>
              <p className="text-xs text-primary-foreground/60 mt-1">Профиль навыков</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-foreground">100%</p>
              <p className="text-xs text-primary-foreground/60 mt-1">Персонализация</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg text-foreground">Карьерный трек</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground">{isSignUp ? "Регистрация" : "Вход в систему"}</h2>
          <p className="text-muted-foreground text-sm mt-2">
            {isSignUp ? "Создайте аккаунт для начала работы" : "Введите данные для входа в аккаунт"}
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
              <label className="text-sm font-medium text-foreground">Email</label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrorMessage(""); }}
                  placeholder="name@company.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Пароль</label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs text-primary hover:underline"
                  >
                    Забыли пароль?
                  </button>
                )}
              </div>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMessage(""); }}
                  placeholder="••••••••"
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
                  <label className="text-sm font-medium text-foreground">Желаемая роль</label>
                  <select
                    value={selectedRole}
                    onChange={(e) => { setSelectedRole(e.target.value as RequestedAppRole); setErrorMessage(""); }}
                    className="w-full mt-1.5 px-4 py-2.5 rounded-lg border border-input bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">После регистрации роль должна быть подтверждена администратором</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">
                    {isHRD ? "Название вашей компании" : "Название компании, в которой вы работаете"}
                  </label>
                  <div className="relative mt-1.5">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => { setCompanyName(e.target.value); setErrorMessage(""); }}
                      placeholder={isHRD ? "Например: ООО «Карьерный трек»" : "Точное название, как зарегистрировал HRD"}
                      required
                      maxLength={120}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isHRD
                      ? "Будет создана новая компания. Названия должны быть уникальными."
                      : "Если компания не найдена — попросите HRD зарегистрироваться первым."}
                  </p>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg gradient-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Загрузка..." : isSignUp ? "Зарегистрироваться" : "Войти"}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center"><span className="bg-background px-3 text-xs text-muted-foreground">или</span></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full py-2.5 rounded-lg border border-border bg-card text-foreground font-medium text-sm hover:bg-secondary transition-colors"
            >
              {isSignUp ? "Зарегистрироваться через Google" : "Войти через Google"}
            </button>

            <p className="text-center text-sm text-muted-foreground">
              {isSignUp ? "Уже есть аккаунт?" : "Нет аккаунта?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setErrorMessage("");
                  if (isSignUp) clearPendingSocialSignup();
                }}
                className="text-primary hover:underline"
              >
                {isSignUp ? "Войти" : "Зарегистрироваться"}
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
