import { Info, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getMetric, type MetricKey, type MetricLang } from "@/lib/metricsCatalog";
import { cn } from "@/lib/utils";

type Props = {
  metricKey: MetricKey;
  className?: string;
  /** Скрыть само название (оставить только иконку (i)). */
  iconOnly?: boolean;
  /** Заменить название на кастомное, оставив всё содержимое поповера. */
  labelOverride?: string;
};

const useLang = (): MetricLang => {
  const { i18n } = useTranslation();
  return (i18n.language?.startsWith("en") ? "en" : "ru") as MetricLang;
};

const HEADINGS: Record<MetricLang, { what: string; how: string; read: string; do: string; open: string }> = {
  ru: { what: "Что это", how: "Как считается", read: "Как читать", do: "Что делать", open: "Открыть раздел" },
  en: { what: "What it is", how: "How it's calculated", read: "How to read", do: "What to do", open: "Open section" },
};

export const MetricLabel = ({ metricKey, className, iconOnly, labelOverride }: Props) => {
  const lang = useLang();
  const m = getMetric(metricKey);
  const h = HEADINGS[lang];
  const label = labelOverride ?? m.label[lang];

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {!iconOnly && <span>{label}</span>}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40"
            aria-label={label}
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-80 text-sm space-y-2.5">
          <div>
            <p className="font-semibold text-foreground leading-tight">{m.label[lang]}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{m.short[lang]}</p>
          </div>
          <Section title={h.how} body={m.formula[lang]} />
          <Section title={h.read} body={m.interpretation[lang]} />
          <Section title={h.do} body={m.action[lang]} />
          {m.href && (
            <Link
              to={m.href}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {h.open} <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
};

const Section = ({ title, body }: { title: string; body: string }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</p>
    <p className="text-xs text-foreground/90 mt-0.5 leading-snug">{body}</p>
  </div>
);

/**
 * Обёртка над числовым значением: крупное значение + мелкая подпись из справочника.
 * Используется в KPI-карточках.
 */
export const MetricValue = ({
  metricKey,
  value,
  className,
  valueClassName,
}: {
  metricKey: MetricKey;
  value: React.ReactNode;
  className?: string;
  valueClassName?: string;
}) => {
  const lang = useLang();
  const m = getMetric(metricKey);
  return (
    <div className={cn("space-y-0.5", className)}>
      <div className={cn("text-2xl font-bold text-foreground", valueClassName)}>{value}</div>
      <p className="text-[11px] text-muted-foreground">{m.short[lang]}</p>
    </div>
  );
};

export default MetricLabel;
