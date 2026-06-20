import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useUserProfile } from "@/hooks/useUserProfile";
import { laravelDb } from "@/integrations/laravel/db";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface TestQuestion {
  id: string;
  text: string;
  competency: string;
  options: { id: string; text: string }[];
  correct_option_id: string;
  weight?: number;
}

export interface TestPayload {
  title: string;
  description?: string;
  questions: TestQuestion[];
  source: "hrd" | "ai_generated";
  testId?: string | null;
}

interface Props {
  test: TestPayload;
  onRetake?: () => void;
}

const ClosedQuestionTestRunner = ({ test, onRetake }: Props) => {
  const { t } = useTranslation("employee");
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | { score: number; total: number; breakdown: { competency: string; score: number; total: number }[] }>(null);

  const allAnswered = test.questions.every((q) => !!answers[q.id]);

  const handleSubmit = async () => {
    if (!user || !allAnswered) return;
    setSubmitting(true);
    try {
      let scorePct = 0;
      let breakdown: { competency: string; score: number; total: number }[] = [];

      if (test.source === "hrd" && test.testId) {
        // Server-side scoring via SECURITY DEFINER RPC. Clients can no longer
        // write to test_attempts directly and cannot fabricate scores.
        const answerMap: Record<string, string> = {};
        for (const q of test.questions) answerMap[q.id] = answers[q.id];
        const { data, error } = await laravelRpc<{
          score: number;
          total: number;
          breakdown: { competency: string; score: number; total: number }[];
        }>("submit_test_attempt", {
          _test_id: test.testId,
          _source: "hrd",
          _answers: answerMap,
        });
        if (error) throw error;
        scorePct = data?.score ?? 0;
        breakdown = data?.breakdown ?? [];
      } else {
        // AI-generated tests are not persisted in closed_question_tests, so they
        // skip test_attempts entirely and only record an assessment row below.
        const detailed = test.questions.map((q) => ({
          competency: q.competency,
          weight: q.weight || 1,
          is_correct: answers[q.id] === q.correct_option_id,
        }));
        const totalWeight = detailed.reduce((s, a) => s + (a.weight || 1), 0);
        const earned = detailed.reduce((s, a) => s + (a.is_correct ? (a.weight || 1) : 0), 0);
        scorePct = Math.round((earned / Math.max(1, totalWeight)) * 100);
        const compMap = new Map<string, { earned: number; total: number }>();
        for (const a of detailed) {
          const cur = compMap.get(a.competency) || { earned: 0, total: 0 };
          cur.total += a.weight || 1;
          if (a.is_correct) cur.earned += a.weight || 1;
          compMap.set(a.competency, cur);
        }
        breakdown = Array.from(compMap.entries()).map(([competency, v]) => ({
          competency,
          score: Math.round((v.earned / Math.max(1, v.total)) * 100),
          total: v.total,
        }));
      }

      await laravelDb.from("assessments").insert({
        user_id: user.id,
        company_id: profile?.company_id ?? null,
        assessment_type: test.source === "hrd" ? "closed_test_hrd" : "closed_test_ai",
        score: scorePct,
        assessment_data: { title: test.title, breakdown } as any,
      });

      for (const c of breakdown) {
        const { data: existing } = await laravelDb
          .from("competencies")
          .select("id")
          .eq("user_id", user.id)
          .eq("skill_name", c.competency)
          .maybeSingle();
        if (existing) {
          await laravelDb.from("competencies").update({ skill_value: c.score }).eq("id", existing.id);
        } else {
          await laravelDb.from("competencies").insert({
            user_id: user.id,
            company_id: profile?.company_id ?? null,
            skill_name: c.competency,
            skill_value: c.score,
          });
        }
      }

      await laravelDb.from("profiles").update({ overall_score: scorePct }).eq("user_id", user.id);

      queryClient.invalidateQueries({ queryKey: ["competencies"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["assessments"] });

      setResult({ score: scorePct, total: 100, breakdown });
      toast.success(t("testRunner.completed", { score: scorePct }));

      setTimeout(() => navigate("/career-track?from=assessment", { replace: true }), 2000);
    } catch (e: any) {
      console.error(e);
      toast.error(t("testRunner.saveError", { msg: e.message }));
    }
    setSubmitting(false);
  };

  if (result) {
    return (
      <div className="max-w-2xl mx-auto bg-card rounded-2xl border border-border p-6 shadow-card animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle2 className="w-8 h-8 text-success" />
          <div>
            <h2 className="text-xl font-bold text-foreground">{t("testRunner.done")}</h2>
            <p className="text-sm text-muted-foreground">{t("testRunner.openingTrack")}</p>
          </div>
        </div>
        <div className="text-3xl font-bold text-foreground mb-2">{result.score}/100</div>
        <div className="space-y-2 mt-4">
          {result.breakdown.map((b) => (
            <div key={b.competency} className="flex justify-between text-sm">
              <span className="text-foreground">{b.competency}</span>
              <span className="font-medium text-muted-foreground">{b.score}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">{test.title}</h1>
        {test.description && <p className="text-muted-foreground text-sm mt-1">{test.description}</p>}
        <p className="text-xs text-muted-foreground mt-2">
          {test.source === "hrd" ? t("testRunner.hrdSource") : t("testRunner.aiSource")} · {t("testRunner.questionsCount", { count: test.questions.length })}
        </p>
      </div>

      <div className="space-y-5">
        {test.questions.map((q, idx) => (
          <div key={q.id} className="bg-card rounded-xl border border-border p-5 shadow-card">
            <div className="flex items-start gap-2 mb-3">
              <span className="text-xs font-mono text-muted-foreground mt-1">{idx + 1}.</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{q.text}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("testRunner.competency", { name: q.competency })}</p>
              </div>
            </div>
            <div className="space-y-2 mt-3">
              {q.options.map((opt) => {
                const selected = answers[q.id] === opt.id;
                return (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={opt.id}
                      checked={selected}
                      onChange={() => setAnswers((p) => ({ ...p, [q.id]: opt.id }))}
                      className="mt-0.5 accent-primary"
                    />
                    <span className="text-sm text-foreground">{opt.text}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="sticky bottom-4 mt-6 flex items-center gap-3 bg-card border border-border rounded-xl p-4 shadow-elevated">
        <span className="text-sm text-muted-foreground flex-1">
          {t("testRunner.answered", { done: Object.keys(answers).length, total: test.questions.length })}
        </span>
        {onRetake && (
          <button onClick={onRetake} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80">
            {t("testRunner.changeTest")}
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
          className="px-5 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {t("testRunner.finish")}
        </button>
      </div>
    </div>
  );
};

export default ClosedQuestionTestRunner;
