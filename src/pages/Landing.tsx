import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import LandingHeader from "@/components/landing/LandingHeader";
import DemoRequestDialog from "@/components/landing/DemoRequestDialog";
import ModuleMosaic from "@/components/landing/ModuleMosaic";
import RolePreview from "@/components/landing/RolePreview";
import LogoMarquee from "@/components/landing/LogoMarquee";
import CountUp from "@/components/landing/CountUp";
import { FEATURES } from "@/data/features";
import { useAuth } from "@/contexts/AuthContext";

/* ----------------------------------------------------------------
 * Landing — Kontur-style: minimum text, maximum visuals + motion.
 * Uses semantic design tokens; no hardcoded colors.
 * ---------------------------------------------------------------- */

const serif = { fontFamily: "'Instrument Serif', Georgia, serif" };

const Kicker = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] font-semibold text-primary">
    <span className="w-6 h-px bg-primary" />
    {children}
  </div>
);

const Landing = () => {
  const { t } = useTranslation("landing");
  const { session, loading } = useAuth();
  const [demoOpen, setDemoOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (session) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader onOpenDemo={() => setDemoOpen(true)} showAnchors={false} />

      {/* ─────────── 1. HERO ─────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 gradient-glow opacity-50" />
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 pt-10 md:pt-20 pb-16 md:pb-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="animate-fade-in">
              <Kicker>{t("hero2.kicker")}</Kicker>
              <h1
                style={serif}
                className="mt-6 text-[clamp(3rem,8vw,7rem)] leading-[0.95] font-normal tracking-tight"
              >
                <span className="block">{t("hero2.title1")}</span>
                <span className="block text-primary italic">{t("hero2.title2")}</span>
              </h1>
              <p className="mt-8 text-xl md:text-2xl text-muted-foreground max-w-md">
                {t("hero2.subtitle")}
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <button
                  onClick={() => setDemoOpen(true)}
                  className="group inline-flex items-center gap-3 px-7 py-4 rounded-full bg-primary text-primary-foreground font-semibold text-base shadow-glow hover:scale-105 transition-transform"
                >
                  {t("hero2.primary")}
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </button>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-full border border-border text-foreground font-semibold text-base hover:bg-secondary transition-colors"
                >
                  {t("hero2.secondary")}
                </Link>
              </div>
            </div>
            <div className="animate-scale-in">
              <ModuleMosaic />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── 2. MODULES — bento grid ─────────── */}
      <section id="modules" className="border-t border-border bg-muted/30">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-20 md:py-28">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 md:mb-16">
            <div>
              <Kicker>{t("modules.kicker")}</Kicker>
              <h2
                style={serif}
                className="mt-4 text-[clamp(2.25rem,5vw,4.5rem)] leading-[1.02] font-normal max-w-3xl"
              >
                {t("modules.title")}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              // bento accents: tiles 0, 5, 10 are bigger / gold
              const isAccent = i === 0 || i === 7 || i === 10;
              const span = i === 0 ? "md:col-span-2 md:row-span-2" : i === 7 ? "lg:col-span-2" : "";
              return (
                <Link
                  key={f.slug}
                  to={`/feature/${f.slug}`}
                  className={[
                    "group relative overflow-hidden rounded-2xl border p-5 md:p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated min-h-[140px] md:min-h-[180px] flex flex-col justify-between animate-fade-in",
                    isAccent
                      ? "bg-primary text-primary-foreground border-primary/60"
                      : "bg-card border-border hover:border-primary/40",
                    span,
                  ].join(" ")}
                  style={{ animationDelay: `${(i % 8) * 40}ms` }}
                >
                  <Icon
                    className={[
                      "transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6",
                      i === 0 ? "w-12 h-12 md:w-16 md:h-16" : "w-8 h-8 md:w-10 md:h-10",
                    ].join(" ")}
                    strokeWidth={1.5}
                  />
                  <div className="flex items-end justify-between gap-2">
                    <div
                      style={serif}
                      className={[
                        "leading-tight",
                        i === 0 ? "text-3xl md:text-5xl" : "text-xl md:text-2xl",
                      ].join(" ")}
                    >
                      {t(`modules.tiles.${f.slug}` as any)}
                    </div>
                    <ArrowUpRight
                      className={[
                        "shrink-0 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1 group-hover:-translate-y-1",
                        i === 0 ? "w-6 h-6" : "w-5 h-5",
                      ].join(" ")}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─────────── 3. AUDIENCE ─────────── */}
      <section className="border-t border-border">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-20 md:py-28">
          <div className="text-center mb-12 md:mb-16">
            <Kicker>{t("audience.kicker")}</Kicker>
            <h2
              style={serif}
              className="mt-4 text-[clamp(2.25rem,5vw,4.5rem)] leading-[1.02] font-normal max-w-3xl mx-auto"
            >
              {t("audience.title")}
            </h2>
          </div>
          <RolePreview />
        </div>
      </section>

      {/* ─────────── 4. STATS ─────────── */}
      <section className="border-t border-border bg-muted/30">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-20 md:py-28">
          <div className="mb-12 md:mb-16">
            <Kicker>{t("stats2.kicker")}</Kicker>
            <h2
              style={serif}
              className="mt-4 text-[clamp(2.25rem,5vw,4.5rem)] leading-[1.02] font-normal max-w-3xl"
            >
              {t("stats2.title")}
            </h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-10">
            {[
              { to: 16, suffix: "", label: t("stats2.items.modules") },
              { to: 1, suffix: "", label: t("stats2.items.tools") },
              { to: 100, suffix: "%", label: t("stats2.items.russia") },
              { to: 2, suffix: "+", label: t("stats2.items.weeks") },
            ].map((s, i) => (
              <div key={i} className="border-t border-border pt-6 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                <CountUp
                  to={s.to}
                  suffix={s.suffix}
                  className="text-[clamp(3.5rem,7vw,6rem)] font-normal leading-none text-foreground tabular-nums"
                />
                <div className="mt-3 text-sm md:text-base text-muted-foreground max-w-[16ch]">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── 5. CLIENTS MARQUEE ─────────── */}
      <section className="border-t border-border">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 pt-16 pb-6 text-center">
          <Kicker>{t("marquee2.kicker")}</Kicker>
        </div>
        <LogoMarquee />
      </section>

      {/* ─────────── 6. FINAL CTA ─────────── */}
      <section className="border-t border-border gradient-hero relative overflow-hidden">
        <div className="absolute inset-0 gradient-glow opacity-60 pointer-events-none" />
        <div className="relative max-w-[1400px] mx-auto px-6 md:px-10 py-24 md:py-36 text-center">
          <h2
            style={serif}
            className="text-[clamp(2.5rem,7vw,6rem)] leading-[1.02] font-normal max-w-4xl mx-auto text-foreground"
          >
            {t("finalCta2.title")}
          </h2>
          <p className="mt-6 text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
            {t("finalCta2.subtitle")}
          </p>
          <div className="mt-10 flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => setDemoOpen(true)}
              className="group inline-flex items-center gap-3 px-8 py-4 rounded-full bg-primary text-primary-foreground font-semibold text-lg shadow-glow hover:scale-105 transition-transform"
            >
              {t("finalCta2.primary")}
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </button>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-border text-foreground font-semibold text-lg hover:bg-secondary transition-colors"
            >
              {t("finalCta2.secondary")}
            </Link>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-border">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div style={serif} className="text-lg text-foreground">Growth Peak</div>
          <div className="flex gap-6">
            <Link to="/pricing" className="hover:text-foreground transition-colors">{t("header.pricing")}</Link>
            <Link to="/login" className="hover:text-foreground transition-colors">{t("header.signIn")}</Link>
            <button onClick={() => setDemoOpen(true)} className="hover:text-foreground transition-colors">
              {t("header.requestDemo")}
            </button>
          </div>
        </div>
      </footer>

      <DemoRequestDialog open={demoOpen} onOpenChange={setDemoOpen} />
    </div>
  );
};

export default Landing;
