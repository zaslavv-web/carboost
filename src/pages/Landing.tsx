import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import LandingHeader from "@/components/landing/LandingHeader";
import DemoRequestDialog from "@/components/landing/DemoRequestDialog";
import HeroDashboardMock from "@/components/landing/HeroDashboardMock";
import HeroMetricsStrip from "@/components/landing/HeroMetricsStrip";
import ModulesGrouped from "@/components/landing/ModulesGrouped";
import ModuleDetailDialog from "@/components/landing/ModuleDetailDialog";
import RolePreview from "@/components/landing/RolePreview";

import CountUp from "@/components/landing/CountUp";
import { useAuth } from "@/contexts/AuthContext";
import type { FeatureSlug } from "@/data/features";

/* ----------------------------------------------------------------
 * Landing — HRD-first positioning:
 *  1) Hero with mission statement + KPI strip + live HRD dashboard mock
 *  2) 16 modules grouped by 4 categories, fits in 100svh, opens detail modal
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
  const [activeModule, setActiveModule] = useState<FeatureSlug | null>(null);
  const [preselectedModule, setPreselectedModule] = useState<FeatureSlug | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (session) return <Navigate to="/" replace />;

  const openDemo = (mod?: FeatureSlug | null) => {
    setPreselectedModule(mod ?? null);
    setDemoOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader onOpenDemo={() => openDemo(null)} showAnchors={false} />

      {/* ─────────── 1. HERO ─────────── */}
      <section className="relative overflow-hidden lg:flex lg:items-center lg:min-h-[calc(100svh-64px)]">
        <div className="absolute inset-0 -z-10 gradient-glow opacity-50" />
        <div className="max-w-[1400px] w-full mx-auto px-6 md:px-10 py-8 md:py-12">

          <div className="grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-center">
            <div className="animate-fade-in">
              <Kicker>{t("hero2.kicker")}</Kicker>
              <h1
                style={serif}
                className="mt-4 text-[clamp(2rem,4.4vw,4rem)] leading-[1.02] font-normal tracking-tight"
              >
                <span className="block">{t("hero2.title1")}</span>
                <span className="block text-primary italic">{t("hero2.title2")}</span>
              </h1>
              <p className="mt-4 text-sm md:text-base text-muted-foreground max-w-xl leading-relaxed">
                {t("hero2.subtitle")}
              </p>

              <HeroMetricsStrip />

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={() => openDemo(null)}
                  className="group inline-flex items-center gap-2.5 px-6 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm md:text-base shadow-glow hover:scale-105 transition-transform"
                >
                  {t("hero2.primary")}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </button>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-border text-foreground font-semibold text-sm md:text-base hover:bg-secondary transition-colors"
                >
                  {t("hero2.secondary")}
                </Link>
              </div>
              <div className="mt-4 text-xs text-muted-foreground">{t("hero2.note")}</div>
            </div>

            <div className="animate-scale-in">
              <HeroDashboardMock />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── 2. MODULES — 4 categories × 4 ─────────── */}
      <section
        id="modules"
        className="border-t border-border bg-muted/30 lg:flex lg:items-center lg:min-h-[100svh]"
      >
        <div className="max-w-[1400px] w-full mx-auto px-6 md:px-10 py-10 md:py-12">

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-5 md:mb-7">
            <div>
              <Kicker>{t("modules.kicker")}</Kicker>
              <h2
                style={serif}
                className="mt-2 text-[clamp(1.5rem,2.6vw,2.5rem)] leading-[1.05] font-normal max-w-3xl"
              >
                {t("modules.title")}
              </h2>
              <p className="mt-1.5 text-xs md:text-sm text-muted-foreground max-w-2xl">
                {t("modules.subtitle")}
              </p>
            </div>
          </div>

          <ModulesGrouped onModuleClick={setActiveModule} />
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

      {/* footer */}
      <footer className="border-t border-border">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div style={serif} className="text-lg text-foreground">Growth Peak</div>
          <div className="flex gap-6">
            <Link to="/pricing" className="hover:text-foreground transition-colors">{t("header.pricing")}</Link>
            <Link to="/login" className="hover:text-foreground transition-colors">{t("header.signIn")}</Link>
            <button onClick={() => openDemo(null)} className="hover:text-foreground transition-colors">
              {t("header.requestDemo")}
            </button>
          </div>
        </div>
      </footer>

      <ModuleDetailDialog
        slug={activeModule}
        onClose={() => setActiveModule(null)}
        onRequestDemo={(slug) => {
          setActiveModule(null);
          openDemo(slug);
        }}
      />
      <DemoRequestDialog
        open={demoOpen}
        onOpenChange={(o) => {
          setDemoOpen(o);
          if (!o) setPreselectedModule(null);
        }}
        preselectedModule={preselectedModule}
        preselectedModuleLabel={
          preselectedModule ? (t(`modules.tiles.${preselectedModule}` as any) as string) : null
        }
      />
    </div>
  );
};

export default Landing;
