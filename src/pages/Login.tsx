import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Mail, Lock, Eye, EyeOff } from "lucide-react";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/");
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

          <h2 className="text-2xl font-bold text-foreground">Вход в систему</h2>
          <p className="text-muted-foreground text-sm mt-2">Введите данные для входа в аккаунт</p>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            <div>
              <label className="text-sm font-medium text-foreground">Email</label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Пароль</label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2">
                  {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-muted-foreground">
                <input type="checkbox" className="rounded border-input" /> Запомнить меня
              </label>
              <button type="button" className="text-primary hover:underline">Забыли пароль?</button>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg gradient-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Войти
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center"><span className="bg-background px-3 text-xs text-muted-foreground">или</span></div>
            </div>

            <button
              type="button"
              className="w-full py-2.5 rounded-lg border border-border bg-card text-foreground font-medium text-sm hover:bg-secondary transition-colors"
            >
              Войти через SSO
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
