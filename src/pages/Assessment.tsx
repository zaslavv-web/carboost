import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles, MessageSquare, ListChecks } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import ClosedQuestionTestRunner, { TestPayload } from "@/components/ClosedQuestionTestRunner";

const Assessment = () => {
  const { data: profile } = useUserProfile();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"choose" | "running" | "ai_chat">("choose");
  const [activeTest, setActiveTest] = useState<TestPayload | null>(null);
  const [generating, setGenerating] = useState(false);

  // Fetch HRD tests for the user's company (active only) — RLS already enforces this
  const { data: hrdTests = [], isLoading } = useQuery({
    queryKey: ["available_hrd_tests", profile?.company_id, profile?.position_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      let q = supabase
        .from("closed_question_tests")
        .select("id, title, description, position_id, questions")
        .eq("company_id", profile.company_id)
        .eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      // Prefer tests matching user's position_id, then unpinned (position_id is null)
      const list = (data || []).filter((t: any) => Array.isArray(t.questions) && t.questions.length > 0);
      list.sort((a: any, b: any) => {
        const am = a.position_id === profile.position_id ? 0 : a.position_id === null ? 1 : 2;
        const bm = b.position_id === profile.position_id ? 0 : b.position_id === null ? 1 : 2;
        return am - bm;
      });
      return list;
    },
    enabled: !!profile?.company_id,
  });

  const startHrdTest = (t: any) => {
    setActiveTest({
      title: t.title,
      description: t.description || undefined,
      questions: t.questions,
      source: "hrd",
      testId: t.id,
    });
    setMode("running");
  };

  const startAiTest = async () => {
    setGenerating(true);
    try {
      // Pull position title + competency profile if available
      let positionTitle = profile?.position || "Сотрудник";
      let competencies: string[] = [];
      if (profile?.position_id) {
        const { data: pos } = await supabase
          .from("positions")
          .select("title, competency_profile")
          .eq("id", profile.position_id)
          .maybeSingle();
        if (pos?.title) positionTitle = pos.title;
        if (Array.isArray(pos?.competency_profile)) {
          competencies = (pos.competency_profile as any[]).map((c: any) => c.skill_name || c.name).filter(Boolean);
        }
      }

      const { data, error } = await supabase.functions.invoke("generate-closed-test", {
        body: { positionTitle, competencies },
      });
      if (error) throw error;
      if (!data?.questions?.length) throw new Error("AI не сгенерировал вопросы");
      setActiveTest({
        title: data.title,
        description: data.description,
        questions: data.questions,
        source: "ai_generated",
        testId: null,
      });
      setMode("running");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Ошибка генерации теста");
    }
    setGenerating(false);
  };

  // Auto-default: if no HRD tests, prepare AI test on first render once profile loaded
  useEffect(() => {
    if (mode !== "choose" || isLoading) return;
    if (hrdTests.length === 0 && !generating && profile?.company_id) {
      // Don't auto-start; let user click — keeps UI intentional
    }
  }, [hrdTests, isLoading, profile?.company_id, mode, generating]);

  if (mode === "running" && activeTest) {
    return <ClosedQuestionTestRunner test={activeTest} onRetake={() => { setActiveTest(null); setMode("choose"); }} />;
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Карьерная оценка</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Пройдите тест с закрытыми вопросами — результаты обновят ваши компетенции и карьерный трек.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          {hrdTests.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">Тесты от HRD вашей компании:</p>
              {hrdTests.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => startHrdTest(t)}
                  className="w-full text-left bg-card rounded-xl border border-border p-5 shadow-card hover:border-primary transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <ListChecks className="w-6 h-6 text-primary mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{t.title}</p>
                      {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
                      <p className="text-xs text-muted-foreground mt-2">{t.questions.length} закрытых вопросов</p>
                    </div>
                  </div>
                </button>
              ))}
            </>
          ) : (
            <div className="bg-card rounded-xl border border-border p-5 shadow-card">
              <div className="flex items-start gap-3">
                <Sparkles className="w-6 h-6 text-primary mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground">Тестов от HRD пока нет</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Сгенерируем для вас тест по вашей должности с помощью AI: 12 закрытых вопросов с одним правильным ответом.
                  </p>
                </div>
              </div>
              <button
                onClick={startAiTest}
                disabled={generating}
                className="mt-4 w-full px-4 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? "AI готовит вопросы..." : "Сгенерировать AI-тест"}
              </button>
            </div>
          )}

          {hrdTests.length > 0 && (
            <button
              onClick={startAiTest}
              disabled={generating}
              className="w-full text-left bg-secondary/40 rounded-xl border border-dashed border-border p-4 hover:border-primary transition-colors flex items-center gap-3 disabled:opacity-50"
            >
              <Sparkles className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground flex-1">Или сгенерировать AI-тест под мою должность</span>
              {generating && <Loader2 className="w-4 h-4 animate-spin" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default Assessment;
