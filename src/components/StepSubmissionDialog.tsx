import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import { X, Upload, Loader2, FileText, Trash2, AlertTriangle, Info, CheckCircle2 } from "lucide-react";

interface Props {
  assignmentId: string;
  templateId: string;
  stepOrder: number;
  stepTitle: string;
  onClose: () => void;
}

interface SimpleQ {
  id?: string;
  question: string;
  options: string[];
  correct: number;
  competency?: string;
}

const StepSubmissionDialog = ({ assignmentId, templateId, stepOrder, stepTitle, onClose }: Props) => {
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [testAttemptId, setTestAttemptId] = useState<string | null>(null);
  const [testScore, setTestScore] = useState<number | null>(null);
  const [showTest, setShowTest] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: lastAttempts = [] } = useQuery({
    queryKey: ["my_step_attempts", assignmentId, stepOrder],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("career_step_submissions")
        .select("attempt_no, status, rejection_reason")
        .eq("assignment_id", assignmentId)
        .eq("step_order", stepOrder)
        .order("attempt_no", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const isReinforced = lastAttempts.length > 0;
  const lastReason = lastAttempts.find((a) => a.status === "rejected")?.rejection_reason;

  const { data: scenario } = useQuery({
    queryKey: ["step_scenario", templateId, stepOrder],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("career_step_scenarios")
        .select("*")
        .eq("template_id", templateId)
        .eq("step_order", stepOrder)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: stepTest } = useQuery({
    queryKey: ["step_test", scenario?.test_id],
    queryFn: async () => {
      if (!scenario?.test_id) return null;
      const { data, error } = await supabase
        .from("closed_question_tests")
        .select("*")
        .eq("id", scenario.test_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!scenario?.test_id,
  });

  const questions: SimpleQ[] = (stepTest?.questions as any) || [];
  const minFiles = isReinforced ? Math.max(2, scenario?.min_files ?? 1) : scenario?.min_files ?? 1;
  const minScore = isReinforced ? Math.max(85, scenario?.min_test_score ?? 80) : scenario?.min_test_score ?? 80;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = e.target.files;
    if (!fs?.length || !user) return;
    setUploading(true);
    try {
      const uploaded: { url: string; name: string }[] = [];
      for (const file of Array.from(fs)) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/${assignmentId}/${stepOrder}/${Date.now()}_${safe}`;
        const { error } = await supabase.storage.from("career-submissions").upload(path, file);
        if (error) throw error;
        uploaded.push({ url: path, name: file.name });
      }
      setFiles((prev) => [...prev, ...uploaded]);
      toast.success(`Загружено ${uploaded.length} файл(ов)`);
    } catch (e: any) {
      toast.error(e.message || "Ошибка загрузки");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submitTest = async () => {
    if (!user) return;
    const correct = questions.reduce((s, q, i) => s + (answers[i] === q.correct ? 1 : 0), 0);
    const pct = Math.round((correct / Math.max(1, questions.length)) * 100);
    if (pct < minScore) {
      toast.error(`Балл ${pct}% ниже порога ${minScore}%. Попробуйте ещё раз.`);
      setAnswers({});
      return;
    }
    const { data, error } = await supabase
      .from("test_attempts")
      .insert({
        user_id: user.id,
        company_id: profile?.company_id ?? null,
        test_id: stepTest?.id ?? null,
        test_source: "career_step",
        answers: answers as any,
        score: pct,
        total: 100,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setTestAttemptId(data.id);
    setTestScore(pct);
    setShowTest(false);
    toast.success(`Тест пройден на ${pct}%`);
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("submit_career_step", {
        _assignment_id: assignmentId,
        _comment: comment || null,
        _test_attempt_id: testAttemptId,
        _file_urls: files as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_step_submissions"] });
      qc.invalidateQueries({ queryKey: ["my_step_attempts"] });
      toast.success("Материалы отправлены на проверку");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const testRequired = scenario?.requires_test && questions.length > 0;
  const canSubmit =
    files.length >= minFiles &&
    (!scenario?.requires_comment || comment.trim().length > 0) &&
    (!testRequired || testAttemptId !== null);

  // INLINE TEST VIEW
  if (showTest) {
    const allAnswered = questions.every((_, i) => answers[i] !== undefined);
    return (
      <div className="fixed inset-0 bg-background/95 z-50 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Контрольный тест этапа · мин. {minScore}%</h3>
            <button onClick={() => setShowTest(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-4">
            {questions.map((q, i) => (
              <div key={i} className="border border-border rounded-lg p-3">
                <p className="text-sm font-medium mb-2">{i + 1}. {q.question}</p>
                <div className="space-y-1.5">
                  {q.options.map((opt, oi) => (
                    <label
                      key={oi}
                      className={`flex items-start gap-2 p-2 rounded cursor-pointer text-sm transition-colors ${
                        answers[i] === oi ? "bg-primary/10 border border-primary/30" : "hover:bg-secondary/40 border border-transparent"
                      }`}
                    >
                      <input
                        type="radio"
                        checked={answers[i] === oi}
                        onChange={() => setAnswers((p) => ({ ...p, [i]: oi }))}
                        className="mt-0.5 accent-primary"
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowTest(false)} className="px-4 py-2 rounded-lg text-sm hover:bg-secondary/60">Отмена</button>
            <button
              onClick={submitTest}
              disabled={!allAnswered}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
            >
              Завершить тест
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div>
            <h3 className="font-semibold text-foreground">Отправить этап на проверку</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{stepTitle}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isReinforced && (
            <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-xs">
              <div className="flex items-center gap-2 text-warning font-medium mb-1">
                <AlertTriangle className="w-4 h-4" /> Усиленный сценарий повторного прохождения
              </div>
              {lastReason && <p className="text-foreground/80">Причина прошлого отклонения: {lastReason}</p>}
              <p className="text-muted-foreground mt-1">
                Требуется минимум {minFiles} файла, тест ≥ {minScore}%, развёрнутый комментарий.
              </p>
            </div>
          )}

          {scenario?.instructions && (
            <div className="rounded-lg bg-info/10 border border-info/20 p-3 text-xs flex gap-2">
              <Info className="w-4 h-4 text-info flex-shrink-0 mt-0.5" />
              <p className="text-foreground/90">
                {isReinforced ? scenario.reinforced_instructions || scenario.instructions : scenario.instructions}
              </p>
            </div>
          )}

          {testRequired && (
            <div>
              <p className="text-sm font-medium mb-2">Контрольный тест (мин. {minScore}%)</p>
              <button
                type="button"
                onClick={() => setShowTest(true)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  testAttemptId
                    ? "border-success/30 bg-success/5"
                    : "border-border hover:border-primary/40 hover:bg-secondary/40"
                }`}
              >
                <p className="text-sm font-medium flex items-center gap-2">
                  {testAttemptId && <CheckCircle2 className="w-4 h-4 text-success" />}
                  {stepTest?.title || "Тест этапа"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {testAttemptId ? `✓ Пройден на ${testScore}%` : `${questions.length} вопросов · нажмите, чтобы пройти`}
                </p>
              </button>
            </div>
          )}

          <div>
            <p className="text-sm font-medium mb-2">
              Подтверждающие файлы ({files.length}/{minFiles} мин.)
            </p>
            <div className="space-y-2 mb-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/40 text-sm">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-destructive hover:opacity-80"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <input ref={fileRef} type="file" multiple onChange={handleUpload} className="hidden" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-sm hover:bg-secondary/40 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Загрузить файлы (сертификаты, скрины, отчёты)
            </button>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">
              Комментарий{scenario?.requires_comment && <span className="text-destructive"> *</span>}
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="Опишите, что было сделано, какие результаты достигнуты"
              className="w-full px-3 py-2 rounded-lg bg-secondary text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-border sticky bottom-0 bg-card">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-secondary/60 transition-colors">
            Отмена
          </button>
          <button
            onClick={() => submitMutation.mutate()}
            disabled={!canSubmit || submitMutation.isPending}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Отправить на проверку
          </button>
        </div>
      </div>
    </div>
  );
};

export default StepSubmissionDialog;
