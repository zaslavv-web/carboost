import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Briefcase, Sparkles, Target, Trophy, BarChart3, ShoppingBag, Users, ArrowRight, Check } from "lucide-react";
import heroImg from "@/assets/landing-hero.jpg";

const features = [
  { icon: Sparkles, title: "AI-оценка компетенций", desc: "Интерактивный диалог с AI выявляет сильные стороны и точки роста сотрудника." },
  { icon: Target, title: "Карьерные треки", desc: "Шаблонные и персональные траектории с этапами, тестами и проверкой HRD." },
  { icon: Trophy, title: "Геймификация", desc: "Баллы, достижения и внутренняя валюта мотивируют двигаться по треку." },
  { icon: BarChart3, title: "Аналитика HRD", desc: "Живые метрики: динамика оценок, готовность к ролям, прогресс по компании." },
  { icon: Users, title: "Цифровой паспорт", desc: "Единая история навыков, опыта и достижений каждого сотрудника." },
  { icon: ShoppingBag, title: "Корпоративный магазин", desc: "Сотрудники тратят заработанную валюту на мерч, дни отдыха и привилегии." },
];

const audiences = [
  {
    title: "Сотруднику",
    points: ["Понятный путь развития", "AI-наставник 24/7", "Бонусы за прогресс"],
  },
  {
    title: "Руководителю",
    points: ["Прозрачность по команде", "Проверка этапов в один клик", "Готовность к ролям"],
  },
  {
    title: "HRD / Админу",
    points: ["Bulk-онбординг", "Аналитика и сценарии", "Гибкая геймификация"],
  },
];

const faq = [
  { q: "Сколько стоит?", a: "Свяжитесь с нами — подберём тариф под размер компании." },
  { q: "Нужна интеграция с нашим HRIS?", a: "Поддерживаем импорт оргструктуры из XLSX/CSV/JSON и AI-парсинг DOCX/PDF." },
  { q: "Безопасны ли мои данные?", a: "Multi-tenant архитектура с RLS: данные компаний полностью изолированы." },
  { q: "Как быстро мы запустимся?", a: "Мастер онбординга за 30 минут: должности, тесты, треки, приглашения." },
];

const Landing = () => {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && session) navigate("/dashboard", { replace: true });
  }, [loading, session, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">Карьерный трек</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Возможности</a>
            <a href="#audience" className="hover:text-foreground transition-colors">Для кого</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <Link
            to="/login"
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Войти
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 md:px-8 pt-12 md:pt-24 pb-16 md:pb-24 grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" /> AI-платформа развития людей
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight tracking-tight">
              Превратите карьеру каждого сотрудника в <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">осязаемый трек</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl">
              AI-оценка, персональные карьерные пути, геймификация и аналитика — в одной системе. От первого дня сотрудника до повышения на новую роль.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity shadow-elevated"
              >
                Войти в систему <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border text-foreground font-semibold hover:bg-secondary transition-colors"
              >
                Посмотреть возможности
              </a>
            </div>
            <div className="flex items-center gap-6 pt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> Multi-tenant</span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> AI Gemini</span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> Безопасность RLS</span>
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/30 to-transparent blur-3xl rounded-full" />
            <img
              src={heroImg}
              alt="Карьерный трек — AI-платформа развития сотрудников"
              width={1536}
              height={1024}
              className="relative rounded-2xl border border-border shadow-elevated"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 md:py-28 bg-card/40">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Всё для развития людей в одной платформе</h2>
            <p className="text-muted-foreground">Шесть инструментов, которые работают как один продукт.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-card rounded-2xl p-6 border border-border hover:border-primary/50 hover:shadow-elevated transition-all">
                <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audience */}
      <section id="audience" className="py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Для каждой роли — своя ценность</h2>
            <p className="text-muted-foreground">Сотрудник, руководитель и HRD получают то, что нужно именно им.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {audiences.map((a) => (
              <div key={a.title} className="bg-card rounded-2xl p-8 border border-border">
                <h3 className="text-xl font-bold mb-5 bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">{a.title}</h3>
                <ul className="space-y-3">
                  {a.points.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm">
                      <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24 bg-gradient-to-br from-primary/15 via-background to-background border-y border-border">
        <div className="max-w-4xl mx-auto px-4 md:px-8 text-center space-y-6">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">Готовы запустить карьерные треки в своей компании?</h2>
          <p className="text-lg text-muted-foreground">Зайдите в систему, создайте компанию и пройдите мастер онбординга за 30 минут.</p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity shadow-elevated"
          >
            Начать <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-4 md:px-8">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-14">Частые вопросы</h2>
          <div className="space-y-4">
            {faq.map(({ q, a }) => (
              <details key={q} className="group bg-card rounded-xl border border-border p-5 hover:border-primary/40 transition-colors">
                <summary className="cursor-pointer font-semibold list-none flex items-center justify-between">
                  {q}
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-open:rotate-90 transition-transform" />
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md gradient-primary flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">Карьерный трек</span>
            <span className="ml-2">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="hover:text-foreground transition-colors">Возможности</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
            <Link to="/login" className="hover:text-foreground transition-colors">Войти</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
