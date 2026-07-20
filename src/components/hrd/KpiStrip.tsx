import { useMemo } from "react";
import { CircleUser, ShieldAlert, Inbox, HeartPulse } from "lucide-react";
import { useHrdInbox } from "@/hooks/useHrdInbox";

const Tile = ({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CircleUser;
  label: string;
  value: string | number;
  tone: string;
}) => (
  <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 min-w-[160px]">
    <div className={`rounded-md p-2 bg-secondary/60 ${tone}`}>
      <Icon className="w-4 h-4" />
    </div>
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
    </div>
  </div>
);

const KpiStrip = () => {
  const { counts } = useHrdInbox();
  const items = useMemo(
    () => [
      { icon: Inbox, label: "В инбоксе", value: counts.total, tone: "text-foreground" },
      { icon: CircleUser, label: "Отпуска", value: counts.leaves, tone: "text-sky-600" },
      { icon: ShieldAlert, label: "Риски", value: counts.risks, tone: "text-amber-600" },
      { icon: HeartPulse, label: "Просрочки", value: counts.probations, tone: "text-destructive" },
    ],
    [counts],
  );
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((i) => <Tile key={i.label} {...i} />)}
    </div>
  );
};

export default KpiStrip;
