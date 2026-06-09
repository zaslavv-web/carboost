import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { laravelDb } from "@/integrations/laravel/db";
import { laravelRpc } from "@/integrations/laravel/rpc";
import { laravelStorage } from "@/integrations/laravel/storage";
import { aiInvoke } from "@/integrations/laravel/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowRight, Briefcase, CheckCircle2, FileText, Loader2, Plus, Save, Sparkles, Upload, X } from "lucide-react";

type Competency = {
  name: string;
  category?: string;
  required_level?: number;
  behavioral_indicators?: string[];
};

type UploadedFile = { path: string; name: string; size: number; type: string };
type ProfileDraft = {
  summary: string;
  strengths: string[];
  growth_areas: string[];
  recommendations: string[];
  career_focus: string;
  risk_notes: string[];
};

const allowedFileTypes = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "image/jpeg",
  "image/png",
];
const allowedExtensions = ["docx", "pdf", "jpg", "jpeg", "png"];

const normalizeCompetencies = (position: any): Competency[] => {
  const templateCompetencies = position?.profile_template?.competencies;
  const legacyCompetencies = position?.competency_profile;
  const source = Array.isArray(templateCompetencies) && templateCompetencies.length > 0 ? templateCompetencies : legacyCompetencies;
  if (!Array.isArray(source)) return [];
  return source
    .map((item: any) => ({
      name: item.name || item.title || "",
      category: item.category || "Functional",
      required_level: Number(item.required_level || item.proficiency || 2),
      behavioral_indicators: Array.isArray(item.behavioral_indicators) ? item.behavioral_indicators : [],
    }))
    .filter((item) => item.name);
};

const EmployeeQuestionnaire = () => {
  const { t } = useTranslation("employee");
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [positionId, setPositionId] = useState<string>(profile?.position_id || "");
  const [otherPosition, setOtherPosition] = useState("");
  const [basic, setBasic] = useState({
    fullName: profile?.full_name || "",
    department: profile?.department || "",
    grade: "",
  });
  const [competencyAnswers, setCompetencyAnswers] = useState<Record<string, { level: number; examples: string[] }>>({});
  const [experience, setExperience] = useState({ years: "", previousRoles: "", projects: "", certificates: "" });
  const [motivators, setMotivators] = useState<string[]>([]);
  const [motivationComment, setMotivationComment] = useState("");
  const [behavioral, setBehavioral] = useState({ decision: "", stress: "", feedback: "" });
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [questionnaireId, setQuestionnaireId] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const [draftText, setDraftText] = useState("");

  const levelHints = t("questionnaire.levelHints", { returnObjects: true }) as string[];
  const driverItems = t("questionnaire.driverItems", { returnObjects: true }) as string[];

  const levelLabels: Record<number, string> = {
    1: t("questionnaire.levels.basic"),
    2: t("questionnaire.levels.confident"),
    3: t("questionnaire.levels.advanced"),
    4: t("questionnaire.levels.expert"),
  };

  const { data: positions = [], isLoading: positionsLoading } = useQuery({
    queryKey: ["questionnaire_positions", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("positions")
        .select("*")
        .eq("company_id", profile?.company_id as string)
        .order("title");
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  const selectedPosition = positions.find((p: any) => p.id === positionId);
  const competencies = useMemo(() => normalizeCompetencies(selectedPosition), [selectedPosition]);
  const answeredCompetencies = competencies.filter((c) => competencyAnswers[c.name]?.level).length;
  const completion = Math.round(
    ((positionId || otherPosition ? 1 : 0) + (basic.fullName ? 1 : 0) + (competencies.length ? answeredCompetencies / competencies.length : 1) + (experience.years ? 1 : 0) + (motivators.length ? 1 : 0)) / 5 * 100,
  );

  const skillGaps = useMemo(() => competencies.map((c) => {
    const current = competencyAnswers[c.name]?.level || 1;
    const required = Math.min(4, Math.max(1, Number(c.required_level || 2)));
    return { name: c.name, category: c.category, current_level: current, required_level: required, gap: Math.max(0, required - current) };
  }), [competencies, competencyAnswers]);

  const buildAnswers = () => ({
    basic,
    competencies: competencies.map((c) => ({ ...c, ...(competencyAnswers[c.name] || { level: 1, examples: [] }) })),
    experience,
    motivators,
    motivation_comment: motivationComment,
    behavioral,
  });

  const formatDraft = (draft: ProfileDraft) => [
    `${t("questionnaire.draftSections.summary")}\n${draft.summary || ""}`,
    `\n${t("questionnaire.draftSections.strengths")}\n${(draft.strengths || []).map((item) => `• ${item}`).join("\n")}`,
    `\n${t("questionnaire.draftSections.growth")}\n${(draft.growth_areas || []).map((item) => `• ${item}`).join("\n")}`,
    `\n${t("questionnaire.draftSections.recommendations")}\n${(draft.recommendations || []).map((item) => `• ${item}`).join("\n")}`,
    `\n${t("questionnaire.draftSections.focus")}\n${draft.career_focus || ""}`,
    draft.risk_notes?.length ? `\n${t("questionnaire.draftSections.risks")}\n${draft.risk_notes.map((item) => `• ${item}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  const uploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    if (!selected.length || !user || !profile?.company_id) return;
    const invalid = selected.find((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      return !allowedExtensions.includes(ext) || !allowedFileTypes.includes(file.type);
    });
    if (invalid) {
      toast.error(t("questionnaire.fileTypeError"));
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (const file of selected) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${profile.company_id}/${user.id}/onboarding/${Date.now()}_${safeName}`;
        const { error } = await laravelStorage.from("employee-questionnaires").upload(path, file);
        if (error) throw error;
        uploaded.push({ path, name: file.name, size: file.size, type: file.type });
      }
      setFiles((prev) => [...prev, ...uploaded]);
      toast.success(t("questionnaire.filesAdded", { count: uploaded.length }));
    } catch (error: any) {
      toast.error(error.message || t("questionnaire.uploadFail"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      if (!user || !profile?.company_id) throw new Error(t("questionnaire.noCompany"));
      if (!positionId && !otherPosition.trim()) throw new Error(t("questionnaire.pickPosition"));
      const answers = buildAnswers();
      const { data: questionnaireId, error } = await laravelRpc("submit_employee_questionnaire" as any, {
        _questionnaire_id: null,
        _position_id: positionId || null,
        _other_position_title: otherPosition || null,
        _answers: answers as any,
        _skill_gaps: skillGaps as any,
        _status: status,
      });
      if (error) throw error;
      if (files.length > 0 && questionnaireId) {
        const { error: filesError } = await laravelDb.from("employee_questionnaire_files" as any).insert(files.map((file) => ({
          questionnaire_id: questionnaireId,
          file_path: file.path,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
        })) as any);
        if (filesError) throw filesError;
      }
      return { questionnaireId: questionnaireId as string, status, answers };
    },
    onSuccess: async ({ questionnaireId, status, answers }) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["profile"] });
        queryClient.invalidateQueries({ queryKey: ["competencies"] });
        queryClient.invalidateQueries({ queryKey: ["assessments"] });
        setQuestionnaireId(questionnaireId);
        toast.success(status === "draft" ? t("questionnaire.draftSaved") : t("questionnaire.submitted"));
        if (status === "submitted") {
          const { data, error } = await aiInvoke("generate-questionnaire-profile", {
            body: { answers, skillGaps, positionTitle: selectedPosition?.title || otherPosition },
          });
          if (error) throw error;
          const draft = data as ProfileDraft;
          setProfileDraft(draft);
          setDraftText(formatDraft(draft));
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } catch (error: any) {
        toast.error(error.message || t("questionnaire.aiFail"));
      }
    },
    onError: (error: any) => toast.error(error.message || t("questionnaire.saveFail")),
  });

  const confirmDraftMutation = useMutation({
    mutationFn: async () => {
      if (!questionnaireId || !profileDraft) throw new Error(t("questionnaire.draftNotFound"));
      const { error } = await laravelDb
        .from("employee_questionnaires" as any)
        .update({
          status: "confirmed",
          ai_interpretation: { ...profileDraft, edited_profile_text: draftText },
        } as any)
        .eq("id", questionnaireId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["latest_employee_questionnaire"] });
      toast.success(t("questionnaire.draftConfirmed"));
      navigate("/passport");
    },
    onError: (error: any) => toast.error(error.message || t("questionnaire.confirmFail")),
  });

  if (positionsLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (profileDraft) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">{t("questionnaire.draftTitle")}</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">{t("questionnaire.draftSubtitle")}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-primary" />{t("questionnaire.aiInterpretation")}</CardTitle>
            <CardDescription>{t("questionnaire.aiInterpretationDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} className="min-h-[420px] font-mono text-sm" />
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {skillGaps.filter((gap) => gap.gap > 0).map((gap) => (
                <div key={gap.name} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{gap.name}</p>
                    <Badge variant="outline">{t("questionnaire.gap")} {gap.gap}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t("questionnaire.yourLevel", { cur: gap.current_level, req: gap.required_level })}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:justify-end">
              <Button variant="outline" onClick={() => setProfileDraft(null)}>{t("questionnaire.backToForm")}</Button>
              <Button onClick={() => confirmDraftMutation.mutate()} disabled={confirmDraftMutation.isPending}>
                {confirmDraftMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {t("questionnaire.confirmProfile")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">{t("questionnaire.title")}</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">{t("questionnaire.subtitle")}</p>
        </div>
        <div className="min-w-56 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("questionnaire.readiness")}</span><span>{completion}%</span>
          </div>
          <Progress value={completion} className="h-2" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Briefcase className="h-5 w-5 text-primary" />{t("questionnaire.currentPosition")}</CardTitle>
          <CardDescription>{t("questionnaire.currentPositionDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("questionnaire.approvedProfile")}</Label>
            <select value={positionId} onChange={(e) => { setPositionId(e.target.value); if (e.target.value) setOtherPosition(""); }} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">{t("questionnaire.selectPosition")}</option>
              {positions.map((position: any) => <option key={position.id} value={position.id}>{position.title}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("questionnaire.otherPosition")}</Label>
            <Input value={otherPosition} onChange={(e) => { setOtherPosition(e.target.value); if (e.target.value) setPositionId(""); }} placeholder={t("questionnaire.otherPositionPh")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("questionnaire.section1")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2"><Label>{t("questionnaire.fullName")}</Label><Input value={basic.fullName} onChange={(e) => setBasic({ ...basic, fullName: e.target.value })} /></div>
          <div className="space-y-2"><Label>{t("questionnaire.department")}</Label><Input value={basic.department} onChange={(e) => setBasic({ ...basic, department: e.target.value })} /></div>
          <div className="space-y-2"><Label>{t("questionnaire.grade")}</Label><Input value={basic.grade} onChange={(e) => setBasic({ ...basic, grade: e.target.value })} placeholder={t("questionnaire.gradePh")} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("questionnaire.section2")}</CardTitle>
          <CardDescription>{competencies.length ? t("questionnaire.section2DescLoaded", { count: competencies.length }) : t("questionnaire.section2DescEmpty")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {competencies.map((competency) => {
            const value = competencyAnswers[competency.name] || { level: 1, examples: [""] };
            return (
              <div key={competency.name} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{competency.name}</p>
                  <Badge variant="secondary">{competency.category || "Functional"}</Badge>
                  <span className="text-xs text-muted-foreground">{t("questionnaire.reference", { level: competency.required_level || 2 })}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-4">
                  {[1, 2, 3, 4].map((level) => (
                    <button key={level} type="button" title={levelHints[level - 1]} onClick={() => setCompetencyAnswers((prev) => ({ ...prev, [competency.name]: { ...value, level } }))} className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${value.level === level ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-secondary"}`}>
                      <span className="block font-semibold">{level}. {levelLabels[level]}</span>
                      <span className="text-muted-foreground">{levelHints[level - 1]}</span>
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label>{t("questionnaire.behavioralExamples")}</Label>
                  {value.examples.slice(0, 3).map((example, index) => (
                    <Input key={index} value={example} onChange={(e) => setCompetencyAnswers((prev) => ({ ...prev, [competency.name]: { ...value, examples: value.examples.map((item, i) => i === index ? e.target.value : item) } }))} placeholder={t("questionnaire.examplePh")} />
                  ))}
                  {value.examples.length < 3 && <Button type="button" variant="outline" size="sm" onClick={() => setCompetencyAnswers((prev) => ({ ...prev, [competency.name]: { ...value, examples: [...value.examples, ""] } }))}><Plus className="h-4 w-4" />{t("questionnaire.addExample")}</Button>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">{t("questionnaire.section3")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>{t("questionnaire.yearsExp")}</Label><Input type="number" min={0} value={experience.years} onChange={(e) => setExperience({ ...experience, years: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t("questionnaire.prevRoles")}</Label><Textarea value={experience.previousRoles} onChange={(e) => setExperience({ ...experience, previousRoles: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t("questionnaire.keyProjects")}</Label><Textarea value={experience.projects} onChange={(e) => setExperience({ ...experience, projects: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t("questionnaire.certificates")}</Label><Textarea value={experience.certificates} onChange={(e) => setExperience({ ...experience, certificates: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>{t("questionnaire.evidenceFiles")}</Label>
              <Input ref={fileRef} type="file" multiple accept=".docx,.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={uploadFiles} />
              {uploading && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />{t("questionnaire.uploading")}</p>}
              <div className="space-y-2">{files.map((file) => <div key={file.path} className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2 text-sm"><span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />{file.name}</span><button onClick={() => setFiles((prev) => prev.filter((item) => item.path !== file.path))} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button></div>)}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">{t("questionnaire.section45")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("questionnaire.drivers")}</Label>
              <div className="flex flex-wrap gap-2">
                {driverItems.map((item) => (
                  <button key={item} type="button" onClick={() => setMotivators((prev) => prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item])} className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${motivators.includes(item) ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-secondary"}`}>{item}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2"><Label>{t("questionnaire.engagementQ")}</Label><Textarea value={motivationComment} onChange={(e) => setMotivationComment(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t("questionnaire.decisionsQ")}</Label><Textarea value={behavioral.decision} onChange={(e) => setBehavioral({ ...behavioral, decision: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t("questionnaire.stressQ")}</Label><Textarea value={behavioral.stress} onChange={(e) => setBehavioral({ ...behavioral, stress: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t("questionnaire.feedbackQ")}</Label><Textarea value={behavioral.feedback} onChange={(e) => setBehavioral({ ...behavioral, feedback: e.target.value })} /></div>
          </CardContent>
        </Card>
      </div>

      {skillGaps.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-primary" />{t("questionnaire.skillGaps")}</CardTitle><CardDescription>{t("questionnaire.skillGapsDesc")}</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {skillGaps.map((gap) => <div key={gap.name} className="rounded-lg border border-border p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium text-foreground">{gap.name}</p><Badge variant={gap.gap > 0 ? "outline" : "secondary"}>{gap.gap > 0 ? `${t("questionnaire.gap")} ${gap.gap}` : t("questionnaire.ok")}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{t("questionnaire.yourLevel", { cur: gap.current_level, req: gap.required_level })}</p></div>)}
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded-lg border border-border bg-card/95 p-3 shadow-card backdrop-blur md:flex-row md:justify-end">
        <Button variant="outline" onClick={() => saveMutation.mutate("draft")} disabled={saveMutation.isPending}><Save className="h-4 w-4" />{t("questionnaire.saveLater")}</Button>
        <Button onClick={() => saveMutation.mutate("submitted")} disabled={saveMutation.isPending || completion < 60}>{saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{t("questionnaire.saveToPassport")}<ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
};

export default EmployeeQuestionnaire;
