import { useTranslation } from "react-i18next";
import { ArrowUpRight } from "lucide-react";
import { MODULE_CATEGORIES, featureBySlug, type FeatureSlug } from "@/data/features";

interface Props {
  onModuleClick: (slug: FeatureSlug) => void;
}

const serif = { fontFamily: "'Instrument Serif', Georgia, serif" };

/**
 * 4 categories × 4 modules — designed to fit a single viewport (100svh) on
 * laptop screens without scrolling. Tile sizes are clamped to viewport height
 * so the whole grid + header collapses gracefully on shorter screens.
 */
const ModulesGrouped = ({ onModuleClick }: Props) => {
  const { t } = useTranslation("landing");

  return (
    <div className="grid grid-cols-1 gap-4 md:gap-5">
      {MODULE_CATEGORIES.map((cat) => (
        <div
          key={cat.key}
          className="grid grid-cols-1 md:grid-cols-[180px_1fr] lg:grid-cols-[220px_1fr] gap-3 md:gap-5 items-start"
        >
          {/* Category label */}
          <div className="md:pt-3">
            <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-primary mb-1">
              {t(`modulesGrouped.categoryKicker.${cat.key}` as any)}
            </div>
            <div style={serif} className="text-xl md:text-2xl leading-tight text-foreground">
              {t(`modulesGrouped.categories.${cat.key}` as any)}
            </div>
          </div>

          {/* Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
            {cat.slugs.map((slug, i) => {
              const Icon = featureBySlug(slug).icon;
              return (
                <button
                  key={slug}
                  onClick={() => onModuleClick(slug)}
                  className="group relative text-left rounded-xl border border-border bg-card hover:border-primary/50 hover:-translate-y-0.5 hover:shadow-elevated transition-all duration-200 p-3 md:p-3.5 flex flex-col gap-2 min-h-[92px] md:min-h-[108px] animate-fade-in"
                  style={{ animationDelay: `${i * 40}ms` }}
                  aria-label={t(`modules.tiles.${slug}` as any)}
                >
                  <div className="flex items-start justify-between">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Icon className="w-4 h-4" strokeWidth={1.8} />
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground leading-tight">
                      {t(`modules.tiles.${slug}` as any)}
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                      {t(`modules.short.${slug}` as any)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ModulesGrouped;
