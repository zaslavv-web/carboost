import { useTranslation } from "react-i18next";
import { ArrowUpRight } from "lucide-react";
import { MODULE_CATEGORIES, type FeatureSlug } from "@/data/features";
import ModuleIcon, { MODULE_ICON_STYLES } from "./ModuleIcons";

interface Props {
  onModuleClick: (slug: FeatureSlug) => void;
}

const serif = { fontFamily: "'Instrument Serif', Georgia, serif" };

/**
 * 4 categories × 4 modules — designed to fit a single viewport (100svh) on
 * laptop screens without scrolling. Tiles use authored animated SVG icons
 * (see ModuleIcons.tsx) that play a "rise to peak" motion on hover.
 */
const ModulesGrouped = ({ onModuleClick }: Props) => {
  const { t } = useTranslation("landing");

  return (
    <>
      <style>{MODULE_ICON_STYLES}</style>
      <div className="grid grid-cols-1 gap-5 md:gap-3.5">
        {MODULE_CATEGORIES.map((cat) => (
          <div
            key={cat.key}
            className="grid grid-cols-1 md:grid-cols-[180px_1fr] lg:grid-cols-[200px_1fr] gap-2.5 md:gap-4 md:items-center"
          >
            {/* Category label */}
            <div className="mb-1 md:mb-0">
              <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-primary mb-0.5">
                {t(`modulesGrouped.categoryKicker.${cat.key}` as any)}
              </div>
              <div style={serif} className="text-xl md:text-xl leading-tight text-foreground">
                {t(`modulesGrouped.categories.${cat.key}` as any)}
              </div>
            </div>

            {/* Tiles: 1 col mobile (horizontal), 2 col tablet, 4 col desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 md:gap-2.5">
              {cat.slugs.map((slug, i) => (
                <button
                  key={slug}
                  onClick={() => onModuleClick(slug)}
                  className="group relative text-left rounded-2xl border border-border bg-card hover:border-primary/60 hover:-translate-y-0.5 hover:shadow-elevated transition-all duration-300 p-3 md:p-3.5 flex flex-row md:flex-col items-center md:items-stretch gap-3 md:gap-2 min-h-[64px] md:min-h-[124px] animate-fade-in overflow-hidden"
                  style={{ animationDelay: `${i * 40}ms` }}
                  aria-label={t(`modules.tiles.${slug}` as any)}
                >
                  <div className="md:flex md:items-start md:justify-between flex-shrink-0">
                    <ModuleIcon slug={slug} />
                    <ArrowUpRight className="hidden md:block w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm md:text-sm font-semibold text-foreground leading-tight">
                      {t(`modules.tiles.${slug}` as any)}
                    </div>
                    <div className="text-[12px] md:text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                      {t(`modules.short.${slug}` as any)}
                    </div>
                  </div>
                  <ArrowUpRight className="md:hidden w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};


export default ModulesGrouped;
