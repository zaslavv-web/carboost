import type { FeatureSlug } from "@/data/features";

/**
 * Authored SVG infographics for the 16 modules. Each icon keeps the semantic
 * cue of its lucide source but adds an authored composition + a "rise to peak"
 * motion concept: elements travel from a low/starting state up to a peak.
 *
 * All animations are pure CSS (no JS) and re-trigger on tile hover via the
 * `.module-icon` group, while a subtle ambient loop plays on idle.
 *
 * Color follows the design system: stroke=currentColor (inherits primary in
 * the tile) and accents use `text-primary` / `text-foreground` utility classes.
 */
export const MODULE_ICON_STYLES = `
@keyframes mi-rise { 0% { transform: translateY(8px); opacity: 0 } 60%,100% { transform: translateY(0); opacity: 1 } }
@keyframes mi-grow { 0% { transform: scaleY(.15); transform-origin: bottom } 100% { transform: scaleY(1); transform-origin: bottom } }
@keyframes mi-draw { from { stroke-dashoffset: var(--len, 100) } to { stroke-dashoffset: 0 } }
@keyframes mi-pulse { 0%,100% { transform: scale(1); opacity: .9 } 50% { transform: scale(1.12); opacity: 1 } }
@keyframes mi-spin { to { transform: rotate(360deg) } }
@keyframes mi-pop { 0% { transform: scale(0); opacity: 0 } 70% { transform: scale(1.15); opacity: 1 } 100% { transform: scale(1); opacity: 1 } }
@keyframes mi-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
@keyframes mi-arc { 0% { transform: translate(-12px,10px) rotate(-25deg); opacity:0 } 60% { opacity: 1 } 100% { transform: translate(0,0) rotate(0); opacity: 1 } }

.module-icon { width: 44px; height: 44px; display:block; color: hsl(var(--primary)); }
.module-icon .bg { fill: hsl(var(--primary) / 0.08); }
.module-icon .accent { fill: hsl(var(--primary)); }
.module-icon .ink { stroke: hsl(var(--primary)); fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.module-icon .soft { stroke: hsl(var(--primary) / 0.35); fill: none; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.module-icon .star { fill: hsl(var(--primary)); }

/* idle ambient */
.module-icon .rise-1 { animation: mi-float 3.6s ease-in-out infinite; transform-origin: center; }
.module-icon .pulse-1 { animation: mi-pulse 2.4s ease-in-out infinite; transform-origin: center; }

/* hover-triggered rise: replay from low → peak */
.group:hover .module-icon .h-rise { animation: mi-rise .55s ease-out both; }
.group:hover .module-icon .h-grow { animation: mi-grow .6s cubic-bezier(.2,.7,.2,1) both; }
.group:hover .module-icon .h-draw { animation: mi-draw .8s ease-out both; }
.group:hover .module-icon .h-pop  { animation: mi-pop .45s cubic-bezier(.2,.9,.3,1.2) both; }
.group:hover .module-icon .h-arc  { animation: mi-arc .65s cubic-bezier(.2,.7,.2,1) both; }
.group:hover .module-icon .h-spin { animation: mi-spin 1.4s linear; transform-origin: center; }

/* staggered children */
.group:hover .module-icon .d-1 { animation-delay: .05s; }
.group:hover .module-icon .d-2 { animation-delay: .12s; }
.group:hover .module-icon .d-3 { animation-delay: .2s; }
.group:hover .module-icon .d-4 { animation-delay: .28s; }
.group:hover .module-icon .d-5 { animation-delay: .36s; }
`;

const VB = "0 0 48 48";

const ModuleIcon = ({ slug }: { slug: FeatureSlug }) => {
  switch (slug) {
    /* ── GROWTH ─────────────────────────────────── */
    case "career-tracks":
      // Stepped ascent → target at peak
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <path className="ink h-draw" style={{ ["--len" as any]: 60 }} strokeDasharray="60" d="M8 36 L18 28 L26 30 L34 18" />
          <g className="rise-1">
            <circle cx="34" cy="18" r="5" className="ink" />
            <circle cx="34" cy="18" r="2" className="accent" />
          </g>
          <circle cx="8" cy="36" r="1.8" className="accent h-pop d-1" />
          <circle cx="18" cy="28" r="1.8" className="accent h-pop d-2" />
          <circle cx="26" cy="30" r="1.8" className="accent h-pop d-3" />
        </svg>
      );
    case "university":
      // Graduation cap tossed up
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <g className="h-arc">
            <path className="accent" d="M24 12 L40 20 L24 28 L8 20 Z" />
            <path className="ink" d="M14 22 V30 Q24 36 34 30 V22" />
            <path className="ink" d="M40 20 V30" />
            <circle cx="40" cy="32" r="1.6" className="accent pulse-1" />
          </g>
        </svg>
      );
    case "ai-assessment":
      // Spark forming sparkle at peak
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <g className="rise-1">
            <path className="accent h-pop d-1" d="M24 10 L26 20 L36 22 L26 24 L24 34 L22 24 L12 22 L22 20 Z" />
          </g>
          <circle cx="36" cy="14" r="1.6" className="accent h-pop d-2" />
          <circle cx="13" cy="36" r="1.2" className="accent h-pop d-3" />
          <circle cx="38" cy="34" r="1" className="accent h-pop d-4" />
        </svg>
      );
    case "performance":
      // Line chart ascending then a peak dot
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <path className="soft" d="M8 38 H40" />
          <path className="ink h-draw" style={{ ["--len" as any]: 70 }} strokeDasharray="70" d="M8 34 L16 28 L22 30 L30 20 L40 14" />
          <circle cx="40" cy="14" r="2.4" className="accent pulse-1" />
        </svg>
      );

    /* ── CULTURE ────────────────────────────────── */
    case "digital-passport":
      // ID card with rising avatar
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <rect x="8" y="12" width="32" height="24" rx="3" className="ink" />
          <g className="h-rise">
            <circle cx="17" cy="22" r="3.2" className="accent" />
            <path d="M11 32 q6 -6 12 0" className="ink" />
          </g>
          <path className="ink h-draw d-1" style={{ ["--len" as any]: 12 }} strokeDasharray="12" d="M26 20 H36" />
          <path className="ink h-draw d-2" style={{ ["--len" as any]: 10 }} strokeDasharray="10" d="M26 25 H34" />
          <path className="ink h-draw d-3" style={{ ["--len" as any]: 14 }} strokeDasharray="14" d="M26 30 H36" />
        </svg>
      );
    case "recognition":
      // Medal scaling up + ribbons
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <path className="ink" d="M18 8 L22 22 M30 8 L26 22" />
          <g className="h-pop rise-1">
            <circle cx="24" cy="30" r="9" className="accent" />
            <circle cx="24" cy="30" r="5.5" fill="hsl(var(--primary-foreground))" />
            <path d="M24 26 L25.4 29 L28.5 29.4 L26.2 31.6 L26.8 34.6 L24 33.1 L21.2 34.6 L21.8 31.6 L19.5 29.4 L22.6 29 Z" className="star" />
          </g>
        </svg>
      );
    case "gamification":
      // Trophy raised, sparks
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <g className="h-rise">
            <path className="accent" d="M16 10 H32 V18 Q32 26 24 26 Q16 26 16 18 Z" />
            <path className="ink" d="M16 14 H10 Q10 22 18 22 M32 14 H38 Q38 22 30 22" />
            <rect x="20" y="26" width="8" height="4" className="ink" fill="hsl(var(--primary)/0.3)" />
            <rect x="16" y="30" width="16" height="3" rx="1" className="accent" />
          </g>
          <circle cx="12" cy="36" r="1.4" className="accent h-pop d-2" />
          <circle cx="36" cy="36" r="1.4" className="accent h-pop d-3" />
          <circle cx="40" cy="10" r="1" className="accent h-pop d-4" />
        </svg>
      );
    case "shop":
      // Shopping bag with floating coin
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <path className="ink" d="M12 18 H36 L34 38 H14 Z" />
          <path className="ink" d="M18 18 V14 Q18 10 24 10 Q30 10 30 14 V18" />
          <g className="rise-1 h-rise">
            <circle cx="32" cy="14" r="3.6" className="accent" />
            <text x="32" y="17" textAnchor="middle" fontSize="6" fontWeight="700" fill="hsl(var(--primary-foreground))">₽</text>
          </g>
        </svg>
      );

    /* ── OPS ───────────────────────────────────── */
    case "onboarding":
      // Document with checkmarks appearing
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <path className="ink" d="M14 8 H30 L36 14 V40 H14 Z" />
          <path className="soft" d="M30 8 V14 H36" />
          {[20, 26, 32].map((y, i) => (
            <g key={y} className={`h-rise d-${i + 1}`}>
              <circle cx="20" cy={y} r="1.8" className="accent" />
              <path d="M19 20.2 L19.7 20.9 L21.2 19.4" transform={`translate(0 ${y - 20})`} stroke="hsl(var(--primary-foreground))" strokeWidth="1.2" fill="none" strokeLinecap="round" />
              <path className="soft" d={`M24 ${y} H32`} />
            </g>
          ))}
        </svg>
      );
    case "leaves":
      // Calendar with day cells filling
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <rect x="10" y="12" width="28" height="26" rx="3" className="ink" />
          <path className="ink" d="M10 18 H38 M18 9 V14 M30 9 V14" />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const c = i % 3, r = Math.floor(i / 3);
            return (
              <rect key={i} x={14 + c * 7} y={22 + r * 6} width="5" height="4" rx="1"
                className={`accent h-pop d-${(i % 5) + 1}`} opacity={[0.35, 0.6, 0.85, 1, 0.7, 0.5][i]} />
            );
          })}
        </svg>
      );
    case "hr-policies":
      // Open book with page flip
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <path className="ink" d="M8 14 Q24 10 24 14 V36 Q24 32 8 36 Z" />
          <path className="ink" d="M40 14 Q24 10 24 14 V36 Q24 32 40 36 Z" />
          <path className="accent h-arc" d="M24 14 Q34 11 34 14 V32 Q34 30 24 32 Z" opacity="0.55" />
          <path className="ink h-draw d-2" style={{ ["--len" as any]: 12 }} strokeDasharray="12" d="M12 20 H20" />
          <path className="ink h-draw d-3" style={{ ["--len" as any]: 10 }} strokeDasharray="10" d="M12 24 H18" />
        </svg>
      );
    case "org-structure":
      // Tree: root → nodes expand upward
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <path className="ink h-draw" style={{ ["--len" as any]: 40 }} strokeDasharray="40" d="M24 38 V28 M14 22 V18 M24 22 V18 M34 22 V18 M14 22 H34" />
          <rect x="20" y="32" width="8" height="6" rx="1.5" className="accent" />
          <rect x="10" y="10" width="8" height="6" rx="1.5" className="ink h-pop d-1" fill="hsl(var(--primary)/0.25)" />
          <rect x="20" y="10" width="8" height="6" rx="1.5" className="ink h-pop d-2" fill="hsl(var(--primary)/0.25)" />
          <rect x="30" y="10" width="8" height="6" rx="1.5" className="ink h-pop d-3" fill="hsl(var(--primary)/0.25)" />
        </svg>
      );

    /* ── DATA ──────────────────────────────────── */
    case "analytics":
      // Growing bars to peak
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <path className="soft" d="M8 38 H40" />
          {[
            { x: 11, h: 8 },
            { x: 19, h: 14 },
            { x: 27, h: 20 },
            { x: 35, h: 26 },
          ].map((b, i) => (
            <rect key={i} x={b.x} y={38 - b.h} width="5" height={b.h} rx="1.2"
              className={`accent h-grow d-${i + 1}`} opacity={0.4 + i * 0.2} />
          ))}
          <circle cx="37.5" cy="12" r="2" className="accent pulse-1" />
        </svg>
      );
    case "rag-ai":
      // Brain with pulsing nodes
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <path className="ink" d="M16 16 Q12 18 12 22 Q9 25 12 28 Q11 33 16 34 Q18 38 24 36 Q30 38 32 34 Q37 33 36 28 Q39 25 36 22 Q36 18 32 16 Q28 12 24 14 Q20 12 16 16 Z" />
          <path className="soft" d="M24 14 V36 M16 22 H32 M14 28 H34" />
          <circle cx="16" cy="22" r="1.8" className="accent pulse-1" />
          <circle cx="32" cy="22" r="1.8" className="accent h-pop d-2" />
          <circle cx="24" cy="28" r="1.8" className="accent h-pop d-3" />
        </svg>
      );
    case "scenarios":
      // Git branch growing
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <path className="ink h-draw" style={{ ["--len" as any]: 50 }} strokeDasharray="50" d="M14 38 V14 M14 22 Q14 16 22 16 H34" />
          <circle cx="14" cy="38" r="2.8" className="accent" />
          <circle cx="14" cy="14" r="2.8" className="ink" fill="hsl(var(--background))" />
          <circle cx="34" cy="16" r="2.8" className="accent h-pop d-3" />
        </svg>
      );
    case "internal-chat":
      // Chat bubbles popping in sequence
      return (
        <svg className="module-icon" viewBox={VB} aria-hidden>
          <rect className="bg" x="2" y="2" width="44" height="44" rx="10" />
          <path className="ink h-pop d-1" d="M8 12 H28 Q32 12 32 16 V24 Q32 28 28 28 H16 L10 32 V28 Q8 28 8 24 Z" fill="hsl(var(--primary)/0.15)" />
          <path className="accent h-pop d-3" d="M20 22 H40 Q42 22 42 24 V32 Q42 34 40 34 H30 L24 38 V34 Q22 34 22 32 V24 Q22 22 24 22 Z" />
          <circle cx="14" cy="20" r="1.2" className="accent" />
          <circle cx="20" cy="20" r="1.2" className="accent" />
        </svg>
      );
    case "default" as any:
    default:
      return null;
  }
};

export default ModuleIcon;
