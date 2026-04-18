import { Check, Clock, Target, CheckCircle2, Award, AlertTriangle, Gauge } from "lucide-react";

export interface RichStep {
  order: number;
  title: string;
  description?: string;
  duration_months: number;
  goals?: string[];
  pass_conditions?: string[];
  rewards?: string[];
  penalty?: string;
  success_metrics?: string[];
}

interface Props {
  step: RichStep;
  index: number;
  totalSteps: number;
  isCompleted: boolean;
  isCurrent: boolean;
}

const Section = ({
  icon,
  title,
  items,
  tone = "muted",
}: {
  icon: React.ReactNode;
  title: string;
  items?: string[] | string;
  tone?: "muted" | "success" | "warning" | "info";
}) => {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  if (!list.length) return null;
  const toneCls =
    tone === "success"
      ? "text-success"
      : tone === "warning"
      ? "text-warning"
      : tone === "info"
      ? "text-info"
      : "text-muted-foreground";
  return (
    <div className="mt-2">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${toneCls} mb-1`}>
        {icon}
        <span>{title}</span>
      </div>
      <ul className="text-xs text-foreground/90 space-y-0.5 pl-5 list-disc">
        {list.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
};

const CareerTrackStepCard = ({ step, index, totalSteps, isCompleted, isCurrent }: Props) => {
  return (
    <div className="flex items-start gap-3 mb-4 last:mb-0">
      <div className="flex flex-col items-center">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
            isCompleted
              ? "bg-success text-success-foreground"
              : isCurrent
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {isCompleted ? <Check className="w-4 h-4" /> : index + 1}
        </div>
        {index < totalSteps - 1 && (
          <div className={`w-0.5 flex-1 min-h-[40px] mt-1 ${isCompleted ? "bg-success" : "bg-border"}`} />
        )}
      </div>
      <div
        className={`flex-1 pb-2 rounded-lg p-3 border ${
          isCurrent ? "border-primary/40 bg-primary/5" : "border-border bg-card"
        }`}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <p
            className={`text-sm font-semibold ${
              isCompleted ? "text-muted-foreground line-through" : "text-foreground"
            }`}
          >
            {step.title}
          </p>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 flex-shrink-0">
            <Clock className="w-3 h-3" />
            {step.duration_months} мес.
          </span>
        </div>
        {step.description && <p className="text-xs text-muted-foreground">{step.description}</p>}

        <Section
          icon={<Target className="w-3 h-3" />}
          title="Ключевые цели"
          items={step.goals}
          tone="info"
        />
        <Section
          icon={<CheckCircle2 className="w-3 h-3" />}
          title="Условия прохождения"
          items={step.pass_conditions}
          tone="success"
        />
        <Section
          icon={<Award className="w-3 h-3" />}
          title="Бонусы за прохождение"
          items={step.rewards}
          tone="success"
        />
        <Section
          icon={<AlertTriangle className="w-3 h-3" />}
          title="При непрохождении"
          items={step.penalty}
          tone="warning"
        />
        <Section
          icon={<Gauge className="w-3 h-3" />}
          title="Метрики успеха"
          items={step.success_metrics}
          tone="muted"
        />
      </div>
    </div>
  );
};

export default CareerTrackStepCard;
