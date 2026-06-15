import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, X } from "lucide-react";
import LandingHeader from "@/components/landing/LandingHeader";
import DemoRequestDialog from "@/components/landing/DemoRequestDialog";
import { FEATURES, ROLE_STORY_KEYS, PAIN_KEYS } from "@/data/features";
import { useAuth } from "@/contexts/AuthContext";

/* ----------------------------------------------------------------
 * Landing — Editorial magazine direction (Ocean Deep palette).
 * Marketing surface: hex literals are intentionally used so that the
 * landing stays visually independent from the app's gold/charcoal
 * design tokens used inside protected routes.
 * ---------------------------------------------------------------- */
const NAVY = "#0c2340";
const MID = "#1a4a6e";
const TEAL = "#2d8a9e";
const MINT = "#5cbdb9";
const BG = "#f5f9fb";

const headingFont = { fontFamily: "'Urbanist', 'Inter', system-ui, sans-serif" };
const bodyFont = { fontFamily: "'Epilogue', 'Inter', system-ui, sans-serif" };

/** Heading helper — Urbanist 800, tight tracking, uppercase optional. */
const H = ({ children, className = "", upper = false }: { children: React.ReactNode; className?: string; upper?: boolean }) => (
  <span style={headingFont} className={`${upper ? "uppercase" : ""} ${className}`}>{children}</span>
);

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: TEAL, borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (session) return <Navigate to="/dashboard" replace />;

  // Featured + grid: 16 modules, the first is a large editorial tile.
  const featured = FEATURES[0]; // ai-assessment
  const gridFeatures = FEATURES.slice(1);

  return (
    <div style={{ background: BG, color: NAVY, ...bodyFont }} className="min-h-screen overflow-x-hidden selection:bg-[#5cbdb9] selection:text-white">
      <LandingHeader onOpenDemo={() => setDemoOpen(true)} />

      {/* ===== HERO ===== */}
      <section className="border-b" style={{ borderColor: `${NAVY}1a` }}>
        <div className="max-w-7xl mx-auto px-5 sm:px-6 md:px-10 py-16 sm:py-20 md:py-28">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-end">
            <div className="lg:col-span-8">
              <span
                className="inline-block px-3 py-1 border text-[10px] font-bold uppercase tracking-[0.2em] mb-8"
                style={{ borderColor: NAVY, color: NAVY }}
              >
                {t("hero.eyebrow")}
              </span>
              <h1 style={headingFont} className="text-[2.4rem] xs:text-5xl sm:text-6xl lg:text-8xl xl:text-9xl font-extrabold leading-[0.95] lg:leading-[0.92] tracking-tight uppercase break-words hyphens-auto">
                {t("hero.titleLine1")}
                <br />
                <span style={{ color: TEAL }}>{t("hero.titleAccent")}</span>
                <br />
                {t("hero.titleLine2")}
              </h1>
            </div>
            <div className="lg:col-span-4 pb-2 border-l-4 pl-4 sm:pl-6" style={{ borderColor: MINT }}>
              <p className="text-lg md:text-xl leading-relaxed mb-8" style={{ color: `${NAVY}cc` }}>
                {t("hero.subtitle")}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setDemoOpen(true)}
                  className="inline-flex items-center gap-2 px-7 py-4 font-bold text-white transition-colors"
                  style={{ background: NAVY }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = MID)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = NAVY)}
                >
                  {t("hero.cta")} <ArrowRight className="w-4 h-4" />
                </button>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 px-7 py-4 font-bold border transition-colors"
                  style={{ borderColor: NAVY, color: NAVY }}
                >
                  {t("hero.ctaLogin")}
                </Link>
              </div>
            </div>
          </div>

          {/* Inline metrics strip */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 border-t" style={{ borderColor: `${NAVY}1a` }}>
            {(["modules", "roles", "deploy", "ai"] as const).map((k) => (
              <div key={k} className="py-6 md:py-8 px-2 border-r last:border-r-0" style={{ borderColor: `${NAVY}1a` }}>
                <div style={headingFont} className="text-3xl md:text-4xl font-extrabold tracking-tight">
                  {t(`hero.metrics.${k}.value`)}
                </div>
                <div className="mt-1 text-xs uppercase tracking-widest" style={{ color: `${NAVY}99` }}>
                  {t(`hero.metrics.${k}.label`)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PAINS ===== */}
      <section id="pains" className="border-b" style={{ borderColor: `${NAVY}1a`, background: "#fff" }}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-20">
          <div className="grid lg:grid-cols-12 gap-10 mb-12">
            <div className="lg:col-span-5">
              <div className="text-xs uppercase tracking-[0.25em] font-bold mb-4" style={{ color: TEAL }}>
                01 / {t("pains.section")}
              </div>
              <h2 style={headingFont} className="text-4xl md:text-5xl font-extrabold uppercase leading-tight tracking-tight">
                {t("pains.title")}
              </h2>
            </div>
            <div className="lg:col-span-6 lg:col-start-7 flex items-end">
              <p className="text-lg" style={{ color: `${NAVY}b3` }}>{t("pains.subtitle")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-t border-l" style={{ borderColor: `${NAVY}1a` }}>
            {PAIN_KEYS.map((key, i) => (
              <button
                key={key}
                type="button"
                onClick={() => setDemoOpen(true)}
                className="text-left p-7 border-r border-b transition-colors group"
                style={{ borderColor: `${NAVY}1a`, background: "#fff" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = BG)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="text-xs font-mono" style={{ color: TEAL }}>0{i + 1}</span>
                  <h3 style={headingFont} className="text-lg font-bold leading-tight">{t(`pains.items.${key}.pain`)}</h3>
                </div>
                <p className="text-sm leading-relaxed mb-4" style={{ color: `${NAVY}99` }}>
                  {t(`pains.items.${key}.solution`)}
                </p>
                <span className="text-xs font-bold uppercase tracking-widest inline-flex items-center gap-1 group-hover:gap-2 transition-all" style={{ color: TEAL }}>
                  {t("pains.learnMore")} <ArrowRight className="w-3 h-3" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES (Magazine grid) ===== */}
      <section id="features" className="border-b" style={{ borderColor: `${NAVY}1a` }}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-20">
          <div className="grid lg:grid-cols-12 gap-10 mb-12">
            <div className="lg:col-span-5">
              <div className="text-xs uppercase tracking-[0.25em] font-bold mb-4" style={{ color: TEAL }}>
                02 / {t("features.section")}
              </div>
              <h2 style={headingFont} className="text-4xl md:text-5xl font-extrabold uppercase leading-tight tracking-tight">
                {t("features.title")}
              </h2>
            </div>
            <div className="lg:col-span-6 lg:col-start-7 flex items-end">
              <p className="text-lg" style={{ color: `${NAVY}b3` }}>{t("features.subtitle")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 border-t border-l" style={{ borderColor: `${NAVY}1a` }}>
            {/* Featured tile — spans 2 cols / 2 rows on lg */}
            {(() => {
              const Icon = featured.icon;
              return (
                <Link
                  to={`/feature/${featured.slug}`}
                  className="p-8 border-r border-b md:col-span-2 lg:col-span-2 lg:row-span-2 flex flex-col justify-between group transition-colors"
                  style={{ borderColor: `${NAVY}1a`, background: NAVY, color: "#fff", minHeight: 320 }}
                >
                  <div>
                    <div className="flex justify-between items-start mb-12">
                      <div className="w-12 h-12 flex items-center justify-center" style={{ background: MINT }}>
                        <Icon className="w-6 h-6" style={{ color: NAVY }} />
                      </div>
                      <span className="text-xs font-mono uppercase tracking-widest" style={{ color: MINT }}>FEATURED</span>
                    </div>
                    <h3 style={headingFont} className="text-3xl md:text-4xl font-extrabold uppercase tracking-tight mb-4 leading-[0.95]">
                      {t(`featureData.${featured.slug}.title`)}
                    </h3>
                    <p className="text-base opacity-80 max-w-md">{t(`featureData.${featured.slug}.tagline`)}</p>
                  </div>
                  <div className="mt-8 pt-6 border-t" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
                    <p className="text-xs uppercase font-bold tracking-widest mb-2" style={{ color: MINT }}>
                      {t(`featureData.${featured.slug}.story.persona`)}
                    </p>
                    <p className="text-sm opacity-90 mb-4">{t(`featureData.${featured.slug}.story.result`)}</p>
                    <span className="text-xs font-bold uppercase tracking-widest inline-flex items-center gap-2 group-hover:gap-3 transition-all" style={{ color: MINT }}>
                      {t("features.reveal")} <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </Link>
              );
            })()}

            {gridFeatures.map((f, idx) => {
              const Icon = f.icon;
              // Alternate accent colours for visual rhythm.
              const accents = [
                { bg: "#fff", text: NAVY, accent: TEAL },
                { bg: BG, text: NAVY, accent: TEAL },
                { bg: "#fff", text: NAVY, accent: MID },
                { bg: MINT, text: NAVY, accent: NAVY },
                { bg: "#fff", text: NAVY, accent: TEAL },
                { bg: BG, text: NAVY, accent: TEAL },
                { bg: MID, text: "#fff", accent: MINT },
                { bg: "#fff", text: NAVY, accent: TEAL },
                { bg: BG, text: NAVY, accent: TEAL },
                { bg: "#fff", text: NAVY, accent: TEAL },
                { bg: TEAL, text: "#fff", accent: MINT },
                { bg: "#fff", text: NAVY, accent: TEAL },
                { bg: BG, text: NAVY, accent: TEAL },
                { bg: "#fff", text: NAVY, accent: TEAL },
                { bg: BG, text: NAVY, accent: TEAL },
              ];
              const c = accents[idx % accents.length];
              return (
                <Link
                  key={f.slug}
                  to={`/feature/${f.slug}`}
                  className="p-7 border-r border-b group transition-transform hover:-translate-y-0.5"
                  style={{ borderColor: `${NAVY}1a`, background: c.bg, color: c.text }}
                >
                  <div className="mb-5" style={{ color: c.accent }}>
                    <Icon className="w-7 h-7" strokeWidth={1.5} />
                  </div>
                  <h3 style={headingFont} className="text-xl font-bold uppercase tracking-tight mb-2 leading-tight">
                    {t(`featureData.${f.slug}.title`)}
                  </h3>
                  <p className="text-sm leading-relaxed opacity-75">
                    {t(`featureData.${f.slug}.tagline`)}
                  </p>
                </Link>
              );
            })}
          </div>

          <div className="mt-10 flex justify-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-7 py-4 font-bold text-white transition-colors"
              style={{ background: NAVY }}
            >
              {t("features.tryAll")} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ===== STORIES ===== */}
      <section id="roles" className="border-b" style={{ borderColor: `${NAVY}1a`, background: "#fff" }}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-20">
          <div className="grid lg:grid-cols-12 gap-10 mb-12">
            <div className="lg:col-span-5">
              <div className="text-xs uppercase tracking-[0.25em] font-bold mb-4" style={{ color: TEAL }}>
                03 / {t("stories.section")}
              </div>
              <h2 style={headingFont} className="text-4xl md:text-5xl font-extrabold uppercase leading-tight tracking-tight">
                {t("stories.title")}
              </h2>
            </div>
            <div className="lg:col-span-6 lg:col-start-7 flex items-end">
              <p className="text-lg" style={{ color: `${NAVY}b3` }}>{t("stories.subtitle")}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-8 border-b pb-8" style={{ borderColor: `${NAVY}1a` }}>
            {ROLE_STORY_KEYS.map((r, i) => (
              <button
                key={r.key}
                onClick={() => setActiveRole(i)}
                style={{
                  background: activeRole === i ? NAVY : "transparent",
                  color: activeRole === i ? "#fff" : NAVY,
                  borderColor: activeRole === i ? NAVY : `${NAVY}33`,
                  ...headingFont,
                }}
                className="px-5 py-2 text-sm font-bold uppercase tracking-widest border transition-all"
              >
                {t(`stories.items.${r.key}.role`)}
              </button>
            ))}
          </div>

          <div className="grid lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5">
              <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: TEAL }}>
                {t(`stories.items.${story.key}.persona`)}
              </p>
              <div className="grid gap-6">
                <div>
                  <div className="inline-block px-3 py-1 mb-3 text-[10px] font-bold uppercase tracking-widest" style={{ background: `${NAVY}0d`, color: NAVY }}>
                    {t("stories.before")}
                  </div>
                  <p className="text-base leading-relaxed">{t(`stories.items.${story.key}.before`)}</p>
                </div>
                <div className="border-t pt-6" style={{ borderColor: `${NAVY}1a` }}>
                  <div className="inline-block px-3 py-1 mb-3 text-[10px] font-bold uppercase tracking-widest" style={{ background: MINT, color: NAVY }}>
                    {t("stories.after")}
                  </div>
                  <p className="text-base leading-relaxed font-medium">{t(`stories.items.${story.key}.after`)}</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 lg:col-start-7 p-10" style={{ background: NAVY, color: "#fff" }}>
              <p className="text-xs uppercase font-bold tracking-widest mb-6" style={{ color: MINT }}>
                {t("stories.usedFeatures")}
              </p>
              <div className="space-y-3 mb-8">
                {storyFeatures.map((f) => {
                  const Icon = f.icon;
                  return (
                    <Link
                      key={f.slug}
                      to={`/feature/${f.slug}`}
                      className="flex items-center gap-4 p-4 border transition-colors"
                      style={{ borderColor: "rgba(255,255,255,0.15)" }}
                    >
                      <div className="w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ background: MINT }}>
                        <Icon className="w-5 h-5" style={{ color: NAVY }} />
                      </div>
                      <div className="flex-1">
                        <div style={headingFont} className="text-sm font-bold uppercase tracking-tight">
                          {t(`featureData.${f.slug}.title`)}
                        </div>
                        <div className="text-xs opacity-70">{t(`featureData.${f.slug}.tagline`)}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 opacity-50" />
                    </Link>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => setDemoOpen(true)} className="inline-flex items-center gap-2 px-5 py-3 font-bold text-sm" style={{ background: MINT, color: NAVY }}>
                  {t("stories.wantSame")} <ArrowRight className="w-4 h-4" />
                </button>
                <Link to="/login" className="inline-flex items-center gap-2 px-5 py-3 font-bold text-sm border" style={{ borderColor: "rgba(255,255,255,0.3)", color: "#fff" }}>
                  {t("stories.tryLogin")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== COMPARISON ===== */}
      <section className="border-b" style={{ borderColor: `${NAVY}1a` }}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-20">
          <div className="grid lg:grid-cols-12 gap-10 mb-12">
            <div className="lg:col-span-5">
              <div className="text-xs uppercase tracking-[0.25em] font-bold mb-4" style={{ color: TEAL }}>
                04 / {t("compare.section")}
              </div>
              <h2 style={headingFont} className="text-4xl md:text-5xl font-extrabold uppercase leading-tight tracking-tight">
                {t("compare.title")}
                <br />
                <span style={{ color: TEAL }}>{t("compare.titleAccent")}</span>
              </h2>
            </div>
            <div className="lg:col-span-6 lg:col-start-7 flex items-end">
              <p className="text-lg" style={{ color: `${NAVY}b3` }}>{t("compare.subtitle")}</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-0 border" style={{ borderColor: `${NAVY}1a` }}>
            <div className="p-10 border-b lg:border-b-0 lg:border-r" style={{ borderColor: `${NAVY}1a`, background: "#fff" }}>
              <div className="inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-widest mb-6" style={{ background: `${NAVY}0d`, color: `${NAVY}99` }}>
                {t("compare.beforeBadge")}
              </div>
              <ul className="space-y-4">
                {(t("compare.before", { returnObjects: true }) as string[]).map((line) => (
                  <li key={line} className="flex items-center gap-3 text-base opacity-60">
                    <X className="w-4 h-4 flex-shrink-0" />
                    <span className="line-through">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-10" style={{ background: NAVY, color: "#fff" }}>
              <div className="inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-widest mb-6" style={{ background: MINT, color: NAVY }}>
                {t("compare.afterBadge")}
              </div>
              <h3 style={headingFont} className="text-3xl font-extrabold uppercase mb-6 tracking-tight">
                {t("compare.afterTitle")}
              </h3>
              <ul className="space-y-4">
                {(t("compare.after", { returnObjects: true }) as string[]).map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <span className="w-2 h-2 flex-shrink-0 mt-2" style={{ background: MINT }} />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="border-b" style={{ borderColor: `${NAVY}1a`, background: "#fff" }}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-20">
          <div className="grid lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4">
              <div className="text-xs uppercase tracking-[0.25em] font-bold mb-4" style={{ color: TEAL }}>
                05 / FAQ
              </div>
              <h2 style={headingFont} className="text-4xl md:text-5xl font-extrabold uppercase leading-tight tracking-tight">
                {t("faq.title")}
              </h2>
              <button onClick={() => setDemoOpen(true)} className="mt-8 inline-flex items-center gap-2 px-6 py-3 font-bold text-white" style={{ background: NAVY }}>
                {t("faq.ask")} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="lg:col-span-7 lg:col-start-6">
              <div className="border-t" style={{ borderColor: `${NAVY}1a` }}>
                {(t("faq.items", { returnObjects: true }) as Array<{ q: string; a: string }>).map(({ q, a }) => (
                  <details key={q} className="group border-b py-5" style={{ borderColor: `${NAVY}1a` }}>
                    <summary style={headingFont} className="cursor-pointer text-base font-bold list-none flex items-center justify-between gap-4 uppercase tracking-tight">
                      <span>{q}</span>
                      <ArrowRight className="w-4 h-4 flex-shrink-0 group-open:rotate-90 transition-transform" style={{ color: TEAL }} />
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed" style={{ color: `${NAVY}b3` }}>{a}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-24 px-6 md:px-10" style={{ background: NAVY, color: "#fff" }}>
        <div className="max-w-5xl mx-auto text-center">
          <div className="text-xs uppercase tracking-[0.3em] font-bold mb-6" style={{ color: MINT }}>
            {t("finalCta.eyebrow")}
          </div>
          <h2 style={headingFont} className="text-5xl md:text-7xl font-extrabold uppercase leading-[0.95] tracking-tight mb-8">
            {t("finalCta.title")}
          </h2>
          <p className="text-lg md:text-xl opacity-80 mb-12 max-w-2xl mx-auto">{t("finalCta.subtitle")}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={() => setDemoOpen(true)} className="inline-flex items-center justify-center gap-2 px-10 py-5 font-bold text-base transition-all" style={{ background: MINT, color: NAVY }}>
              {t("finalCta.demo")} <ArrowRight className="w-4 h-4" />
            </button>
            <Link to="/login" className="inline-flex items-center justify-center gap-2 px-10 py-5 font-bold text-base border" style={{ borderColor: "rgba(255,255,255,0.3)", color: "#fff" }}>
              {t("finalCta.login")}
            </Link>
          </div>
          <p className="mt-16 text-xs font-mono uppercase tracking-[0.3em] opacity-40">
            {t("finalCta.status")}
          </p>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="py-10 px-6 md:px-10" style={{ background: NAVY, color: "rgba(255,255,255,0.7)", borderTop: `1px solid rgba(255,255,255,0.1)` }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-3">
            <span style={headingFont} className="font-extrabold uppercase tracking-wider text-white">{t("footer.brand")}</span>
            <span className="opacity-50">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <a href="#pains" className="hover:text-white transition-colors">{t("footer.tasks")}</a>
            <a href="#features" className="hover:text-white transition-colors">{t("footer.capabilities")}</a>
            <a href="#roles" className="hover:text-white transition-colors">{t("footer.stories")}</a>
            <a href="#faq" className="hover:text-white transition-colors">{t("footer.faq")}</a>
            <Link to="/pricing" className="hover:text-white transition-colors">{t("header.pricing")}</Link>
            <Link to="/login" className="hover:text-white transition-colors">{t("footer.signIn")}</Link>
          </div>
        </div>
      </footer>

      <DemoRequestDialog open={demoOpen} onOpenChange={setDemoOpen} source="landing" />
    </div>
  );
};

export default Landing;
