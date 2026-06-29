import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { featureBySlug, type FeatureSlug } from "@/data/features";

interface Props {
  slug: FeatureSlug | null;
  onClose: () => void;
  onRequestDemo: (slug: FeatureSlug) => void;
}

const serif = { fontFamily: "'Instrument Serif', Georgia, serif" };

const ModuleDetailDialog = ({ slug, onClose, onRequestDemo }: Props) => {
  const { t } = useTranslation("landing");
  if (!slug) return null;
  const meta = featureBySlug(slug);
  const Icon = meta.icon;
  const bullets = t(`modules.detail.${slug}.bullets` as any, { returnObjects: true }) as unknown;
  const bulletList = Array.isArray(bullets) ? (bullets as string[]) : [];

  return (
    <Dialog open={!!slug} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <div className="p-6 md:p-8">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Icon className="w-5 h-5" strokeWidth={1.8} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-primary">
                  {t(`modulesGrouped.categories.${meta.category}` as any)}
                </div>
                <DialogTitle style={serif} className="text-2xl md:text-3xl font-normal leading-tight text-left">
                  {t(`modules.tiles.${slug}` as any)}
                </DialogTitle>
              </div>
            </div>
          </DialogHeader>

          <p className="mt-4 text-sm md:text-base text-muted-foreground leading-relaxed">
            {t(`modules.detail.${slug}.summary` as any)}
          </p>

          {bulletList.length > 0 && (
            <div className="mt-5">
              <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground mb-2.5">
                {t("moduleDialog.inside")}
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {bulletList.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="mt-0.5 w-4 h-4 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5" strokeWidth={3} />
                    </span>
                    <span className="leading-snug">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={() => onRequestDemo(slug)}
              className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:scale-105 transition-transform"
            >
              {t("moduleDialog.primaryCta")}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <Link
              to={`/feature/${slug}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border text-foreground font-semibold text-sm hover:bg-secondary transition-colors"
            >
              {t("moduleDialog.secondaryCta")}
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModuleDetailDialog;
