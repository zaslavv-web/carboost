import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check } from "lucide-react";
import heroImg from "@/assets/landing-hero.jpg";
import LandingHeader from "@/components/landing/LandingHeader";
import DemoRequestDialog from "@/components/landing/DemoRequestDialog";
import { FEATURES, ROLE_STORY_KEYS, PAIN_KEYS } from "@/data/features";
import { useAuth } from "@/contexts/AuthContext";

const Landing = () => {
  const { t } = useTranslation("landing");
  const { session, loading } = useAuth();
  const [demoOpen, setDemoOpen] = useState(false);
  const [activeRole, setActiveRole] = useState(0);

  const story = ROLE_STORY_KEYS[activeRole];
  const storyFeatures = story.features
    .map((slug) => FEATURES.find((f) => f.slug === slug))
    .filter(Boolean) as typeof FEATURES;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader onOpenDemo={() => setDemoOpen(true)} />

      {/* Hero */}
      <section className="relative overflow-hidden min-h-[calc(100vh-4rem)] flex items-center">
        <img src={heroImg} alt={t("hero.imageAlt")} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-background/95 via-background/80 to-background/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />

        <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24 w-full">
          <div className="max-w-3xl space-y-6">
            <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.02] tracking-tight -mt-[30px]">
              {t("hero.titleLine1")}<br />{t("hero.titleLine2")}<br />
              <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">{t("hero.titleAccent")}</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">{t("hero.subtitle")}</p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button onClick={() => setDemoOpen(true)} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity shadow-elevated">
                {t("hero.cta")} <ArrowRight className="w-4 h-4" />
              </button>
              <Link to="/login" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border bg-background/60 backdrop-blur-sm font-semibold hover:bg-secondary transition-colors">
                {t("hero.ctaLogin")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Pains */}
      <section id="pains" className="min-h-screen flex items-center py-12 bg-card/40 border-y border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-8 w-full">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">{t("pains.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("pains.subtitle")}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PAIN_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setDemoOpen(true)}
                className="text-left bg-card rounded-xl border border-border p-4 hover:border-primary/50 hover:shadow-elevated transition-all group"
              >
                <div className="flex items-start gap-2.5 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                  <p className="font-semibold text-sm leading-snug">{t(`pains.items.${key}.pain`)}</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">{t(`pains.items.${key}.solution`)}</p>
                <span className="text-xs text-primary font-medium inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                  {t("pains.learnMore")} <ArrowRight className="w-3 h-3" />
                </span>
              </button>
            ))}
          </div>
          <div className="flex justify-center mt-6">
            <button onClick={() => setDemoOpen(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
              {t("pains.discuss")} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="min-h-screen flex items-center py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-8 w-full">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">{t("features.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("features.subtitle")}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <Link
                  key={f.slug}
                  to={`/feature/${f.slug}`}
                  className="group bg-card rounded-xl p-4 border border-border hover:border-primary/50 hover:shadow-elevated transition-all flex flex-col"
                >
                  <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center mb-2">
                    <Icon className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <h3 className="font-semibold text-base mb-1">{t(`featureData.${f.slug}.title`)}</h3>
                  <p className="text-xs text-muted-foreground mb-2">{t(`featureData.${f.slug}.tagline`)}</p>
                  <div className="mt-auto pt-2 border-t border-border">
                    <p className="text-[11px] text-muted-foreground italic mb-1 line-clamp-1">«{t(`featureData.${f.slug}.story.persona`)}»</p>
                    <p className="text-xs leading-snug mb-2 line-clamp-2">{t(`featureData.${f.slug}.story.result`)}</p>
                    <span className="text-xs text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all font-medium">
                      {t("features.reveal")} <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="flex justify-center mt-6">
            <Link to="/login" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
              {t("features.tryAll")} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Stories */}
      <section id="roles" className="min-h-screen flex items-center py-12 bg-card/40 border-y border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-8 w-full">
          <div className="text-center max-w-2xl mx-auto mb-6">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">{t("stories.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("stories.subtitle")}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mb-5">
            {ROLE_STORY_KEYS.map((r, i) => (
              <button
                key={r.key}
                onClick={() => setActiveRole(i)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeRole === i
                    ? "bg-primary text-primary-foreground shadow-card"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}
              >
                {t(`stories.items.${r.key}.role`)}
              </button>
            ))}
          </div>
          <div className="bg-card rounded-2xl border border-border p-6 md:p-8">
            <p className="text-sm text-primary font-semibold mb-2">{t(`stories.items.${story.key}.persona`)}</p>
            <div className="grid md:grid-cols-2 gap-6 mt-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium">
                  {t("stories.before")}
                </div>
                <p className="text-sm leading-relaxed">{t(`stories.items.${story.key}.before`)}</p>
              </div>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-success/10 text-success text-xs font-medium">
                  {t("stories.after")}
                </div>
                <p className="text-sm leading-relaxed font-medium">{t(`stories.items.${story.key}.after`)}</p>
              </div>
            </div>
            <div className="mt-6 pt-5 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">{t("stories.usedFeatures")}</p>
              <div className="grid sm:grid-cols-3 gap-2">
                {storyFeatures.map((f) => {
                  const Icon = f.icon;
                  return (
                    <Link
                      key={f.slug}
                      to={`/feature/${f.slug}`}
                      className="flex items-center gap-2 p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-background transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary-foreground" />
                      </div>
                      <div className="text-xs font-medium">{t(`featureData.${f.slug}.title`)}</div>
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-5">
              <button onClick={() => setDemoOpen(true)} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
                {t("stories.wantSame")} <ArrowRight className="w-4 h-4" />
              </button>
              <Link to="/login" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-border text-sm font-semibold hover:bg-secondary transition-colors">
                {t("stories.tryLogin")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="min-h-screen flex items-center py-12 bg-gradient-to-br from-primary/15 via-background to-background">
        <div className="max-w-4xl mx-auto px-4 md:px-8 text-center space-y-5 w-full">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">{t("finalCta.title")}</h2>
          <p className="text-base md:text-lg text-muted-foreground">{t("finalCta.subtitle")}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button onClick={() => setDemoOpen(true)} className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity shadow-elevated">
              {t("finalCta.demo")} <ArrowRight className="w-4 h-4" />
            </button>
            <Link to="/login" className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-lg border border-border font-semibold hover:bg-secondary transition-colors">
              {t("finalCta.login")}
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="min-h-screen flex items-center py-12 border-t border-border">
        <div className="max-w-3xl mx-auto px-4 md:px-8 w-full">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-center mb-6">{t("faq.title")}</h2>
          <div className="space-y-3">
            {(t("faq.items", { returnObjects: true }) as Array<{ q: string; a: string }>).map(({ q, a }) => (
              <details key={q} className="group bg-card rounded-xl border border-border p-4 hover:border-primary/40 transition-colors">
                <summary className="cursor-pointer text-sm font-semibold list-none flex items-center justify-between">
                  {q}
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-open:rotate-90 transition-transform" />
                </summary>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
          <div className="flex justify-center mt-6">
            <button onClick={() => setDemoOpen(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
              {t("faq.ask")} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{t("footer.brand")}</span>
            <span className="ml-2">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <a href="#pains" className="hover:text-foreground transition-colors">{t("footer.tasks")}</a>
            <a href="#features" className="hover:text-foreground transition-colors">{t("footer.capabilities")}</a>
            <a href="#roles" className="hover:text-foreground transition-colors">{t("footer.stories")}</a>
            <a href="#faq" className="hover:text-foreground transition-colors">{t("footer.faq")}</a>
            <Link to="/login" className="hover:text-foreground transition-colors">{t("footer.signIn")}</Link>
          </div>
        </div>
      </footer>

      <DemoRequestDialog open={demoOpen} onOpenChange={setDemoOpen} source="landing" />
    </div>
  );
};

export default Landing;
