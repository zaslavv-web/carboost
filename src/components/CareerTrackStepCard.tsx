import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, Clock, Target, CheckCircle2, Award, AlertTriangle, Gauge, Send, Gift, Hourglass, XCircle } from "lucide-react";
import StepSubmissionDialog from "@/components/StepSubmissionDialog";

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
  assignmentId?: string;
  templateId?: string;
}

const Section = ({
  icon,
  title,
  items,
  tone = "muted",
  highlight = false,
}: {
  icon: React.ReactNode;
  title: string;
  items?: string[] | string;
  tone?: "muted" | "success" | "warning" | "info";
  highlight?: boolean;
}) => {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  if (!list.length) return null;
  const toneCls =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "info" ? "text-info" : "text-muted-foreground";
  return (
    <div className={`mt-2 ${highlight ? "rounded-lg bg-success/5 border border-success/20 p-2" : ""}`}>
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

const CareerTrackStepCard = ({ step, index, totalSteps, isCompleted, isCurrent, assignmentId, templateId }: Props) => {
  const [showSubmit, setShowSubmit] = useState(false);

  const { data: latestSubmission } = useQuery({
    queryKey: ["my_step_submission", assignmentId, index],
    queryFn: async () => {
      if (!assignmentId) return null;
      const { data } = await supabase
        .from("career_step_submissions")
        .select("*")
        .eq("assignment_id", assignmentId)
        .eq("step_order", index)
        .order("attempt_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!assignmentId && isCurrent,
  });

  const pendingReview = latestSubmission?.status === "pending_review";
  const wasRejected = latestSubmission?.status === "rejected";

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
          <p className={`text-sm font-semibold ${isCompleted ? "text-muted-foreground line-through" : "text-foreground"}`}>
            {step.title}
          </p>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 flex-shrink-0">
            <Clock className="w-3 h-3" />
            {step.duration_months} мес.
          </span>
        </div>
        {step.description && <p className="text-xs text-muted-foreground">{step.description}</p>}

        <Section icon={<Target className="w-3 h-3" />} title="Ключевые цели" items={step.goals} tone="info" />
        <Section
          icon={<CheckCircle2 className="w-3 h-3" />}
          title="Условия прохождения"
          items={step.pass_conditions}
          tone="success"
        />

        {step.rewards && step.rewards.length > 0 && (
          <Section
            icon={<Gift className="w-3 h-3" />}
            title="🎁 Награда за прохождение этапа"
            items={step.rewards}
            tone="success"
            highlight
          />
        )}

        <Section icon={<AlertTriangle className="w-3 h-3" />} title="При непрохождении" items={step.penalty} tone="warning" />
        <Section icon={<Gauge className="w-3 h-3" />} title="Метрики успеха" items={step.success_metrics} tone="muted" />

        {/* Submission status / actions */}
        {isCurrent && assignmentId && templateId && (
          <div className="mt-3 pt-3 border-t border-border/50">
            {pendingReview ? (
              <div className="flex items-center gap-2 text-xs text-info bg-info/10 rounded-lg p-2">
                <Hourglass className="w-4 h-4 flex-shrink-0" />
                <span>Материалы отправлены и ждут проверки руководителя/HRD</span>
              </div>
            ) : wasRejected ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-2">
                  <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Этап отклонён</p>
                    {latestSubmission?.rejection_reason && (
                      <p className="text-foreground/80 mt-0.5">{latestSubmission.rejection_reason}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowSubmit(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-warning text-warning-foreground text-xs font-medium hover:opacity-90"
                >
                  <Send className="w-3.5 h-3.5" />
                  Запустить усиленный сценарий повтора
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSubmit(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
              >
                <Send className="w-3.5 h-3.5" />
                Этап пройден — отправить на проверку
              </button>
            )}
          </div>
        )}
      </div>

      {showSubmit && assignmentId && templateId && (
        <StepSubmissionDialog
          assignmentId={assignmentId}
          templateId={templateId}
          stepOrder={index}
          stepTitle={step.title}
          onClose={() => setShowSubmit(false)}
        />
      )}
    </div>
  );
};

export default CareerTrackStepCard;
