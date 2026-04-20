import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, AlertTriangle, Sparkles } from "lucide-react";
import heroImg from "@/assets/landing-hero.jpg";
import LandingHeader from "@/components/landing/LandingHeader";
import DemoRequestDialog from "@/components/landing/DemoRequestDialog";
import { FEATURES, ROLE_STORIES, HRD_PAINS } from "@/data/features";

const Landing = () => {
  const [demoOpen, setDemoOpen] = useState(false);
  const [activeRole, setActiveRole] = useState(0);

  const story = ROLE_STORIES[activeRole];
  const storyFeatures = story.features
    .map((slug) => FEATURES.find((f) => f.slug === slug))
    .filter(Boolean) as typeof FEATURES;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader onOpenDemo={() => setDemoOpen(true)} />

      {/* Hero — full-bleed image background with overlay */}
      <section className="relative overflow-hidden min-h-[calc(100vh-4rem)] flex items-center">
        <img
          src={heroImg}
          alt="Карьерный трек — AI-платформа для HR"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-background/95 via-background/80 to-background/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />

        <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24 w-full">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 backdrop-blur-sm text-primary text-xs font-medium border border-primary/20">
              <Sparkles className="w-3.5 h-3.5" /> Платформа для HR и HRD
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.02] tracking-tight">
              Снизьте текучесть<br />и нагрузку на HR<br />
              <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">с одной системой</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
              AI-оценка, карьерные треки, геймификация и live-аналитика. Заменяет 4 системы и освобождает HR от рутины.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button onClick={() => setDemoOpen(true)} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity shadow-elevated">
                Запросить демо <ArrowRight className="w-4 h-4" />
              </button>
              <Link to="/login" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border bg-background/60 backdrop-blur-sm font-semibold hover:bg-secondary transition-colors">
                Войти в систему
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-6 pt-8 max-w-xl">
              <div>
                <p className="text-3xl md:text-4xl font-bold text-primary">−24%</p>
                <p className="text-xs text-muted-foreground mt-1">текучесть за полгода</p>
              </div>
              <div>
                <p className="text-3xl md:text-4xl font-bold text-primary">×10</p>
                <p className="text-xs text-muted-foreground mt-1">скорость онбординга</p>
              </div>
              <div>
                <p className="text-3xl md:text-4xl font-bold text-primary">25 мин</p>
                <p className="text-xs text-muted-foreground mt-1">на оценку вместо 4 часов</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HRD Pains */}
      <section id="pains" className="py-20 md:py-28 bg-card/40 border-y border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-warning/10 text-warning text-xs font-medium mb-4">
              <AlertTriangle className="w-3.5 h-3.5" /> Знакомые боли HRD
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Если хоть одно — про вас, читайте дальше</h2>
            <p className="text-muted-foreground">Мы собрали систему вокруг шести самых дорогих болей HR-функции.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {HRD_PAINS.map((p) => (
              <div key={p.pain} className="bg-card rounded-2xl border border-border p-6">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                  </div>
                  <p className="font-semibold text-sm leading-snug">{p.pain}</p>
                </div>
                <div className="flex items-start gap-3 pl-1">
                  <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">{p.solution}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-12">
            <button onClick={() => setDemoOpen(true)} className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
              Обсудить мою ситуацию <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Features (clickable) */}
      <section id="features" className="py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Шесть инструментов, которые работают как один продукт</h2>
            <p className="text-muted-foreground">Кликните на любую возможность, чтобы увидеть как она устроена.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <Link
                  key={f.slug}
                  to={`/feature/${f.slug}`}
                  className="group bg-card rounded-2xl p-6 border border-border hover:border-primary/50 hover:shadow-elevated transition-all flex flex-col"
                >
                  <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{f.tagline}</p>
                  <div className="mt-auto pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground italic mb-2">«{f.story.persona}»</p>
                    <p className="text-sm leading-snug mb-3">{f.story.result}</p>
                    <span className="text-sm text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all font-medium">
                      Раскрыть возможности <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="flex justify-center mt-12">
            <Link to="/login" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
              Попробовать всё в системе <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Role storytelling */}
      <section id="roles" className="py-20 md:py-28 bg-card/40 border-y border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Истории, в которых вы себя узнаете</h2>
            <p className="text-muted-foreground">Выберите роль и посмотрите путь «было → стало».</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {ROLE_STORIES.map((r, i) => (
              <button
                key={r.role}
                onClick={() => setActiveRole(i)}
                className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                  activeRole === i
                    ? "bg-primary text-primary-foreground shadow-card"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}
              >
                {r.role}
              </button>
            ))}
          </div>
          <div className="bg-card rounded-2xl border border-border p-8 md:p-12">
            <p className="text-sm text-primary font-semibold mb-2">{story.persona}</p>
            <div className="grid md:grid-cols-2 gap-8 mt-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium">
                  Было
                </div>
                <p className="text-base leading-relaxed">{story.before}</p>
              </div>
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-success/10 text-success text-xs font-medium">
                  Стало
                </div>
                <p className="text-base leading-relaxed font-medium">{story.after}</p>
              </div>
            </div>
            <div className="mt-10 pt-8 border-t border-border">
              <p className="text-sm text-muted-foreground mb-4">Используемые возможности:</p>
              <div className="grid sm:grid-cols-3 gap-3">
                {storyFeatures.map((f) => {
                  const Icon = f.icon;
                  return (
                    <Link
                      key={f.slug}
                      to={`/feature/${f.slug}`}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-background transition-all"
                    >
                      <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary-foreground" />
                      </div>
                      <div className="text-sm font-medium">{f.title}</div>
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <button onClick={() => setDemoOpen(true)} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
                Хочу так же — запросить демо <ArrowRight className="w-4 h-4" />
              </button>
              <Link to="/login" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border font-semibold hover:bg-secondary transition-colors">
                Войти и попробовать
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 md:py-28 bg-gradient-to-br from-primary/15 via-background to-background">
        <div className="max-w-4xl mx-auto px-4 md:px-8 text-center space-y-6">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">Соберите HR-функцию вокруг данных, а не Excel</h2>
          <p className="text-lg text-muted-foreground">30-минутный созвон — покажем платформу под вашу структуру и боли.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <button onClick={() => setDemoOpen(true)} className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity shadow-elevated">
              Запросить демо <ArrowRight className="w-4 h-4" />
            </button>
            <Link to="/login" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-lg border border-border font-semibold hover:bg-secondary transition-colors">
              Войти в систему
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 md:py-28 border-t border-border">
        <div className="max-w-3xl mx-auto px-4 md:px-8">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-12">Частые вопросы HRD</h2>
          <div className="space-y-4">
            {[
              { q: "Сколько времени займёт запуск?", a: "От 30 минут до 1 дня. Мастер онбординга проведёт по чек-листу: должности, тесты, треки, приглашения. Bulk-импорт сотрудников — XLSX/CSV." },
              { q: "Нужна интеграция с нашим HRIS / 1С:ЗУП?", a: "Поддерживаем импорт оргструктуры из XLSX/CSV/JSON и AI-парсинг DOCX/PDF. Глубокая интеграция с HRIS — по запросу." },
              { q: "Как защищены данные сотрудников?", a: "Multi-tenant архитектура с RLS на уровне БД: данные компаний полностью изолированы. Хранение в облаке РФ — обсуждается отдельно." },
              { q: "Можно ли загрузить наши сценарии оценки?", a: "Да. Загружаете DOCX/PDF — AI парсит и формирует сценарий, который дальше можно редактировать визуально." },
              { q: "Подходит ли для малого бизнеса?", a: "Да, от 10 человек. Тарификация — по числу сотрудников. Свяжитесь — рассчитаем под вас." },
            ].map(({ q, a }) => (
              <details key={q} className="group bg-card rounded-xl border border-border p-5 hover:border-primary/40 transition-colors">
                <summary className="cursor-pointer font-semibold list-none flex items-center justify-between">
                  {q}
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-open:rotate-90 transition-transform" />
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
          <div className="flex justify-center mt-12">
            <button onClick={() => setDemoOpen(true)} className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
              Остались вопросы — задайте на демо <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">Карьерный трек</span>
            <span className="ml-2">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <a href="#pains" className="hover:text-foreground transition-colors">Боли HRD</a>
            <a href="#features" className="hover:text-foreground transition-colors">Возможности</a>
            <a href="#roles" className="hover:text-foreground transition-colors">Истории</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
            <Link to="/login" className="hover:text-foreground transition-colors">Войти</Link>
          </div>
        </div>
      </footer>

      <DemoRequestDialog open={demoOpen} onOpenChange={setDemoOpen} source="landing" />
    </div>
  );
};

export default Landing;
