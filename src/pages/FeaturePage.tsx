import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import LandingHeader from "@/components/landing/LandingHeader";
import DemoRequestDialog from "@/components/landing/DemoRequestDialog";
import { FEATURES } from "@/data/features";

const FeaturePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [demoOpen, setDemoOpen] = useState(false);
  const feature = FEATURES.find((f) => f.slug === slug);

  if (!feature) {
    return (
      <div className="min-h-screen bg-background">
        <LandingHeader onOpenDemo={() => setDemoOpen(true)} />
        <div className="max-w-3xl mx-auto px-4 py-24 text-center">
          <h1 className="text-2xl font-bold mb-4">Фича не найдена</h1>
          <Link to="/" className="text-primary hover:underline">← На главную</Link>
        </div>
      </div>
    );
  }

  const Icon = feature.icon;
  const otherFeatures = FEATURES.filter((f) => f.slug !== feature.slug).slice(0, 3);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader onOpenDemo={() => setDemoOpen(true)} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-4 md:px-8 pt-12 md:pt-20 pb-16">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Все возможности
          </button>
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-6">
            <Icon className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">{feature.title}</h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl">{feature.hero}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link to="/login" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
              Войти и попробовать <ArrowRight className="w-4 h-4" />
            </Link>
            <button onClick={() => setDemoOpen(true)} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border font-semibold hover:bg-secondary transition-colors">
              Запросить демо
            </button>
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4 md:px-8">
          <div className="bg-card rounded-2xl border border-border p-8 md:p-10">
            <p className="text-sm text-primary font-semibold mb-2">История клиента</p>
            <p className="text-lg font-semibold mb-6">{feature.story.persona}</p>
            <div className="grid md:grid-cols-3 gap-6 text-sm">
              <div>
                <p className="text-muted-foreground mb-2">Боль</p>
                <p>{feature.story.pain}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-2">Решение</p>
                <p>{feature.story.solution}</p>
              </div>
              <div>
                <p className="text-success font-semibold mb-2">Результат</p>
                <p>{feature.story.result}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sections */}
      <section className="pb-16 md:pb-20">
        <div className="max-w-4xl mx-auto px-4 md:px-8 space-y-10">
          {feature.sections.map((sec) => (
            <div key={sec.heading} className="bg-card rounded-2xl border border-border p-8">
              <h2 className="text-2xl font-bold mb-4">{sec.heading}</h2>
              <p className="text-muted-foreground mb-4 leading-relaxed">{sec.body}</p>
              {sec.bullets && (
                <ul className="space-y-2">
                  {sec.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-sm">
                      <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* HRD value */}
      <section className="py-16 md:py-20 bg-card/40 border-y border-border">
        <div className="max-w-4xl mx-auto px-4 md:px-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Что это даёт HRD</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {feature.hrdValue.map((v) => (
              <div key={v} className="bg-card rounded-xl border border-border p-5 text-sm">
                <Check className="w-5 h-5 text-success mb-3" />
                {v}
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-10">
            <Link to="/login" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
              Войти в систему <ArrowRight className="w-4 h-4" />
            </Link>
            <button onClick={() => setDemoOpen(true)} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border font-semibold hover:bg-secondary transition-colors">
              Запросить демо
            </button>
          </div>
        </div>
      </section>

      {/* Other features */}
      <section className="py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Другие возможности</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {otherFeatures.map((f) => {
              const FIcon = f.icon;
              return (
                <Link
                  key={f.slug}
                  to={`/feature/${f.slug}`}
                  className="bg-card rounded-2xl border border-border p-6 hover:border-primary/50 hover:shadow-elevated transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center mb-4">
                    <FIcon className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <h3 className="font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{f.tagline}</p>
                  <span className="text-sm text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                    Подробнее <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <DemoRequestDialog open={demoOpen} onOpenChange={setDemoOpen} source={`feature-${feature.slug}`} />
    </div>
  );
};

export default FeaturePage;
