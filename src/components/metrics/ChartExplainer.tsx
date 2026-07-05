import { MetricLabel } from "./MetricLabel";
import type { MetricKey } from "@/lib/metricsCatalog";
import { cn } from "@/lib/utils";

/**
 * Заголовок для карточки/графика: название метрики с (i) и опциональная
 * подпись «На что смотреть». Не заменяет CardHeader, а вкладывается в него.
 */
export const ChartExplainer = ({
  metricKey,
  hint,
  className,
  actions,
}: {
  metricKey: MetricKey;
  hint?: string;
  className?: string;
  actions?: React.ReactNode;
}) => (
  <div className={cn("flex items-start justify-between gap-3", className)}>
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-foreground">
        <MetricLabel metricKey={metricKey} />
      </h3>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
    {actions && <div className="shrink-0">{actions}</div>}
  </div>
);

export default ChartExplainer;
