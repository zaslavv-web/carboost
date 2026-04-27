import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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

const allowedFileTypes = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "image/jpeg",
  "image/png",
];
const allowedExtensions = ["docx", "pdf", "jpg", "jpeg", "png"];
const levelHints = [
  "Понимаю основы и применяю с поддержкой",
  "Выполняю типовые задачи самостоятельно",
  "Уверенно применяю в сложных ситуациях",
  "Экспертно развиваю практику и обучаю других",
];

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

  const { data: positions = [], isLoading: positionsLoading } = useQuery({
    queryKey: ["questionnaire_positions", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
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

  const uploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    if (!selected.length || !user || !profile?.company_id) return;
    const invalid = selected.find((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      return !allowedExtensions.includes(ext) || !allowedFileTypes.includes(file.type);
    });
    if (invalid) {
      toast.error("Можно прикрепить только DOCX, PDF, JPG или PNG");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (const file of selected) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${profile.company_id}/${user.id}/onboarding/${Date.now()}_${safeName}`;
        const { error } = await supabase.storage.from("employee-questionnaires").upload(path, file);
        if (error) throw error;
        uploaded.push({ path, name: file.name, size: file.size, type: file.type });
      }
      setFiles((prev) => [...prev, ...uploaded]);
      toast.success(`Добавлено файлов: ${uploaded.length}`);
    } catch (error: any) {
      toast.error(error.message || "Не удалось загрузить файлы");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      if (!user || !profile?.company_id) throw new Error("Профиль сотрудника не привязан к компании");
      if (!positionId && !otherPosition.trim()) throw new Error("Выберите должность или укажите вариант вручную");
      const answers = {
        basic,
        competencies: competencies.map((c) => ({ ...c, ...(competencyAnswers[c.name] || { level: 1, examples: [] }) })),
        experience,
        motivators,
        motivation_comment: motivationComment,
        behavioral,
      };
      const { data: questionnaireId, error } = await supabase.rpc("submit_employee_questionnaire" as any, {
        _questionnaire_id: null,
        _position_id: positionId || null,
        _other_position_title: otherPosition || null,
        _answers: answers as any,
        _skill_gaps: skillGaps as any,
        _status: status,
      });
      if (error) throw error;
      if (files.length > 0 && questionnaireId) {
        const { error: filesError } = await supabase.from("employee_questionnaire_files" as any).insert(files.map((file) => ({
          questionnaire_id: questionnaireId,
          file_path: file.path,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
        })) as any);
        if (filesError) throw filesError;
      }
      return questionnaireId;
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["competencies"] });
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
      toast.success(status === "draft" ? "Черновик анкеты сохранён" : "Анкета отправлена, цифровой паспорт обновлён");
      if (status === "submitted") navigate("/passport");
    },
    onError: (error: any) => toast.error(error.message || "Не удалось сохранить анкету"),
  });

  if (positionsLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Анкета сотрудника</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">Первичное заполнение и самооценка для цифрового паспорта</p>
        </div>
        <div className="min-w-56 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Готовность</span><span>{completion}%</span>
          </div>
          <Progress value={completion} className="h-2" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Briefcase className="h-5 w-5 text-primary" />Текущая должность</CardTitle>
          <CardDescription>Обязательный шаг: от него зависит динамический набор компетенций</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Утверждённый профиль должности</Label>
            <select value={positionId} onChange={(e) => { setPositionId(e.target.value); if (e.target.value) setOtherPosition(""); }} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Выберите должность</option>
              {positions.map((position: any) => <option key={position.id} value={position.id}>{position.title}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Другая должность</Label>
            <Input value={otherPosition} onChange={(e) => { setOtherPosition(e.target.value); if (e.target.value) setPositionId(""); }} placeholder="Например: инженер по качеству" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Базовая информация</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2"><Label>ФИО</Label><Input value={basic.fullName} onChange={(e) => setBasic({ ...basic, fullName: e.target.value })} /></div>
          <div className="space-y-2"><Label>Подразделение</Label><Input value={basic.department} onChange={(e) => setBasic({ ...basic, department: e.target.value })} /></div>
          <div className="space-y-2"><Label>Текущий грейд</Label><Input value={basic.grade} onChange={(e) => setBasic({ ...basic, grade: e.target.value })} placeholder="Например: middle / grade 7" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">2. Самооценка компетенций</CardTitle>
          <CardDescription>{competencies.length ? `Компетенции загружены из эталона: ${competencies.length}` : "Выберите должность, чтобы подгрузить эталон компетенций"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {competencies.map((competency) => {
            const value = competencyAnswers[competency.name] || { level: 1, examples: [""] };
            return (
              <div key={competency.name} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{competency.name}</p>
                  <Badge variant="secondary">{competency.category || "Functional"}</Badge>
                  <span className="text-xs text-muted-foreground">Эталон: уровень {competency.required_level || 2}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-4">
                  {[1, 2, 3, 4].map((level) => (
                    <button key={level} type="button" title={levelHints[level - 1]} onClick={() => setCompetencyAnswers((prev) => ({ ...prev, [competency.name]: { ...value, level } }))} className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${value.level === level ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-secondary"}`}>
                      <span className="block font-semibold">{level}. {level === 1 ? "Базовый" : level === 2 ? "Уверенный" : level === 3 ? "Продвинутый" : "Эксперт"}</span>
                      <span className="text-muted-foreground">{levelHints[level - 1]}</span>
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label>Behavioral примеры</Label>
                  {value.examples.slice(0, 3).map((example, index) => (
                    <Input key={index} value={example} onChange={(e) => setCompetencyAnswers((prev) => ({ ...prev, [competency.name]: { ...value, examples: value.examples.map((item, i) => i === index ? e.target.value : item) } }))} placeholder="Опишите ситуацию, действие и результат" />
                  ))}
                  {value.examples.length < 3 && <Button type="button" variant="outline" size="sm" onClick={() => setCompetencyAnswers((prev) => ({ ...prev, [competency.name]: { ...value, examples: [...value.examples, ""] } }))}><Plus className="h-4 w-4" />Добавить пример</Button>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">3. Опыт и достижения</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Опыт работы, лет</Label><Input type="number" min={0} value={experience.years} onChange={(e) => setExperience({ ...experience, years: e.target.value })} /></div>
            <div className="space-y-2"><Label>Предыдущие роли</Label><Textarea value={experience.previousRoles} onChange={(e) => setExperience({ ...experience, previousRoles: e.target.value })} /></div>
            <div className="space-y-2"><Label>Ключевые проекты и результаты</Label><Textarea value={experience.projects} onChange={(e) => setExperience({ ...experience, projects: e.target.value })} /></div>
            <div className="space-y-2"><Label>Сертификаты и обучение</Label><Textarea value={experience.certificates} onChange={(e) => setExperience({ ...experience, certificates: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Файлы-доказательства</Label>
              <Input ref={fileRef} type="file" multiple accept=".docx,.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={uploadFiles} />
              {uploading && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Загрузка файлов</p>}
              <div className="space-y-2">{files.map((file) => <div key={file.path} className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2 text-sm"><span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />{file.name}</span><button onClick={() => setFiles((prev) => prev.filter((item) => item.path !== file.path))} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button></div>)}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">4–5. Мотивация и поведенческий профиль</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Приоритетные драйверы</Label>
              <div className="flex flex-wrap gap-2">
                {["Признание", "Автономия", "Сложность задач", "Финансы", "Баланс", "Рост", "Команда", "Стабильность"].map((item) => (
                  <button key={item} type="button" onClick={() => setMotivators((prev) => prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item])} className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${motivators.includes(item) ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-secondary"}`}>{item}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2"><Label>Что сильнее всего влияет на вашу вовлечённость?</Label><Textarea value={motivationComment} onChange={(e) => setMotivationComment(e.target.value)} /></div>
            <div className="space-y-2"><Label>Как вы принимаете решения в неопределённости?</Label><Textarea value={behavioral.decision} onChange={(e) => setBehavioral({ ...behavioral, decision: e.target.value })} /></div>
            <div className="space-y-2"><Label>Как реагируете на стресс и сжатые сроки?</Label><Textarea value={behavioral.stress} onChange={(e) => setBehavioral({ ...behavioral, stress: e.target.value })} /></div>
            <div className="space-y-2"><Label>Как предпочитаете получать обратную связь?</Label><Textarea value={behavioral.feedback} onChange={(e) => setBehavioral({ ...behavioral, feedback: e.target.value })} /></div>
          </CardContent>
        </Card>
      </div>

      {skillGaps.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-primary" />Предварительные skill gaps</CardTitle><CardDescription>Расчёт выполняется автоматически по самооценке и эталону должности</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {skillGaps.map((gap) => <div key={gap.name} className="rounded-lg border border-border p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium text-foreground">{gap.name}</p><Badge variant={gap.gap > 0 ? "outline" : "secondary"}>{gap.gap > 0 ? `Gap ${gap.gap}` : "OK"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Ваш уровень {gap.current_level} / эталон {gap.required_level}</p></div>)}
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded-lg border border-border bg-card/95 p-3 shadow-card backdrop-blur md:flex-row md:justify-end">
        <Button variant="outline" onClick={() => saveMutation.mutate("draft")} disabled={saveMutation.isPending}><Save className="h-4 w-4" />Дозаполнить позже</Button>
        <Button onClick={() => saveMutation.mutate("submitted")} disabled={saveMutation.isPending || completion < 60}>{saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Сохранить в паспорт<ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
};

export default EmployeeQuestionnaire;
