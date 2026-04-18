import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { X, Upload, Loader2, FileText, Trash2, AlertTriangle, Info } from "lucide-react";
import ClosedQuestionTestRunner from "@/components/ClosedQuestionTestRunner";

interface Props {
  assignmentId: string;
  templateId: string;
  stepOrder: number;
  stepTitle: string;
  onClose: () => void;
}

const StepSubmissionDialog = ({ assignmentId, templateId, stepOrder, stepTitle, onClose }: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [testAttemptId, setTestAttemptId] = useState<string | null>(null);
  const [showTest, setShowTest] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // last attempt to know if this is reinforced
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

  const { data: test } = useQuery({
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

  const canSubmit =
    files.length >= minFiles &&
    (!scenario?.requires_comment || comment.trim().length > 0) &&
    (!scenario?.requires_test || !!testAttemptId);

  if (showTest && test) {
    return (
      <div className="fixed inset-0 bg-background/95 z-50 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Контрольный тест этапа</h3>
            <button onClick={() => setShowTest(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
          <ClosedQuestionTestRunner
            test={test as any}
            onComplete={(attemptId, scorePct) => {
              if (scorePct < minScore) {
                toast.error(`Балл ${scorePct}% ниже порога ${minScore}%. Попробуйте ещё раз.`);
                return;
              }
              setTestAttemptId(attemptId);
              setShowTest(false);
              toast.success(`Тест пройден на ${scorePct}%`);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card">
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
              <p className="text-foreground/90">{isReinforced ? scenario.reinforced_instructions || scenario.instructions : scenario.instructions}</p>
            </div>
          )}

          {/* Test */}
          {scenario?.requires_test && (
            <div>
              <p className="text-sm font-medium mb-2">Контрольный тест (минимум {minScore}%)</p>
              {test ? (
                <button
                  type="button"
                  onClick={() => setShowTest(true)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    testAttemptId
                      ? "border-success/30 bg-success/5"
                      : "border-border hover:border-primary/40 hover:bg-secondary/40"
                  }`}
                >
                  <p className="text-sm font-medium">{test.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {testAttemptId ? "✓ Тест пройден — можно отправлять" : "Нажмите, чтобы пройти тест"}
                  </p>
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">Тест ещё не назначен HRD — этап можно отправить без теста.</p>
              )}
            </div>
          )}

          {/* Files */}
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
              Загрузить файлы
            </button>
          </div>

          {/* Comment */}
          <div>
            <p className="text-sm font-medium mb-2">Комментарий{scenario?.requires_comment && <span className="text-destructive"> *</span>}</p>
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
