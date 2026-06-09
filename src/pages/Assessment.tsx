import { laravelDb } from "@/integrations/laravel/db";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles, ListChecks } from "lucide-react";
import { toast } from "sonner";

import { aiInvoke } from "@/integrations/laravel/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import ClosedQuestionTestRunner, { TestPayload } from "@/components/ClosedQuestionTestRunner";

const Assessment = () => {
  const { t } = useTranslation("employee");
  const { data: profile } = useUserProfile();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"choose" | "running" | "ai_chat">("choose");
  const [activeTest, setActiveTest] = useState<TestPayload | null>(null);
  const [generating, setGenerating] = useState(false);

  const { data: hrdTests = [], isLoading } = useQuery({
    queryKey: ["available_hrd_tests", profile?.company_id, profile?.position_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      let q = laravelDb
        .from("closed_question_tests")
        .select("id, title, description, position_id, questions")
        .eq("company_id", profile.company_id)
        .eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
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

  const startHrdTest = (item: any) => {
    setActiveTest({
      title: item.title,
      description: item.description || undefined,
      questions: item.questions,
      source: "hrd",
      testId: item.id,
    });
    setMode("running");
  };

  const startAiTest = async () => {
    setGenerating(true);
    try {
      let positionTitle = profile?.position || t("assessment.fallbackPosition");
      let competencies: string[] = [];
      if (profile?.position_id) {
        const { data: pos } = await laravelDb
          .from("positions")
          .select("title, competency_profile")
          .eq("id", profile.position_id)
          .maybeSingle();
        if (pos?.title) positionTitle = pos.title;
        if (Array.isArray(pos?.competency_profile)) {
          competencies = (pos.competency_profile as any[]).map((c: any) => c.skill_name || c.name).filter(Boolean);
        }
      }

      const { data, error } = await aiInvoke("generate-closed-test", {
        body: { positionTitle, competencies },
      });
      if (error) throw error;
      if (!data?.questions?.length) throw new Error(t("assessment.aiNoQuestions"));
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
      toast.error(e.message || t("assessment.generationError"));
    }
    setGenerating(false);
  };

  useEffect(() => {
    if (mode !== "choose" || isLoading) return;
  }, [hrdTests, isLoading, profile?.company_id, mode, generating]);

  if (mode === "running" && activeTest) {
    return <ClosedQuestionTestRunner test={activeTest} onRetake={() => { setActiveTest(null); setMode("choose"); }} />;
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">{t("assessment.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("assessment.subtitle")}</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          {hrdTests.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">{t("assessment.hrdTests")}</p>
              {hrdTests.map((item: any) => (
                <button
                  key={item.id}
                  onClick={() => startHrdTest(item)}
                  className="w-full text-left bg-card rounded-xl border border-border p-5 shadow-card hover:border-primary transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <ListChecks className="w-6 h-6 text-primary mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{item.title}</p>
                      {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
                      <p className="text-xs text-muted-foreground mt-2">{t("assessment.questionsCount", { count: item.questions.length })}</p>
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
                  <p className="font-semibold text-foreground">{t("assessment.noHrdTests")}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t("assessment.noHrdTestsDesc")}</p>
                </div>
              </div>
              <button
                onClick={startAiTest}
                disabled={generating}
                className="mt-4 w-full px-4 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? t("assessment.aiPreparing") : t("assessment.generateAi")}
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
              <span className="text-sm text-muted-foreground flex-1">{t("assessment.orGenerate")}</span>
              {generating && <Loader2 className="w-4 h-4 animate-spin" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default Assessment;
