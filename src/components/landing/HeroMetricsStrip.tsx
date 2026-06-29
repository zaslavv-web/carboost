import { useTranslation } from "react-i18next";
import CountUp from "./CountUp";

/**
 * Inline KPI strip below the hero subtitle. Three numbers, compact, no border-heavy
 * cards — pure typographic emphasis so it doesn't compete with the hero dashboard.
 */
const HeroMetricsStrip = () => {
  const { t } = useTranslation("landing");
  const items = [
    { to: 34, prefix: "−", suffix: "%", key: "turnover" },
    { to: 12, prefix: "−", suffix: " ч", key: "routine" },
    { to: 27, prefix: "+", suffix: "%", key: "engagement" },
  ];
  return (
    <div className="mt-8 grid grid-cols-3 gap-4 md:gap-8 max-w-lg">
      {items.map((m) => (
        <div key={m.key} className="border-t border-border pt-3">
          <CountUp
            to={m.to}
            prefix={m.prefix}
            suffix={m.suffix}
            className="block text-2xl md:text-3xl font-semibold tabular-nums leading-none text-foreground"
          />
          <div className="mt-1.5 text-[11px] md:text-xs text-muted-foreground leading-snug">
            {t(`heroMetrics.${m.key}.label` as any)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default HeroMetricsStrip;
