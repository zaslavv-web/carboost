import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Lock, Eye, EyeOff } from "lucide-react";
import brandLogo from "@/assets/logo-growth-peak.png";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Пароли не совпадают");
      return;
    }
    if (password.length < 6) {
      toast.error("Пароль должен содержать минимум 6 символов");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Пароль успешно обновлён");
      navigate("/login");
    } catch (error: any) {
      toast.error(error.message || "Ошибка при обновлении пароля");
    } finally {
      setLoading(false);
    }
  };

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm text-center">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center mx-auto mb-6">
            <Briefcase className="w-5 h-5 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Ссылка недействительна</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Перейдите по ссылке из письма для сброса пароля
          </p>
          <button
            onClick={() => navigate("/login")}
            className="text-primary hover:underline text-sm"
          >
            Вернуться к входу
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <img src={brandLogo} alt="Пик Роста" width={40} height={40} className="w-10 h-10 object-contain" />
          <div className="leading-tight">
            <span className="block font-bold text-base text-foreground">Пик Роста</span>
            <span className="block text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Growth Peak</span>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-foreground">Новый пароль</h2>
        <p className="text-muted-foreground text-sm mt-2">Введите новый пароль для вашего аккаунта</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="text-sm font-medium text-foreground">Новый пароль</label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

          <div>
            <label className="text-sm font-medium text-foreground">Подтвердите пароль</label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg gradient-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? "Обновление..." : "Обновить пароль"}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            <button type="button" onClick={() => navigate("/login")} className="text-primary hover:underline">
              Вернуться к входу
            </button>
          </p>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
