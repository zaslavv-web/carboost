import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useUserProfile, usePrimaryRole } from "@/hooks/useUserProfile";
import { Activity, Plus, Play, Square, Trash2, BarChart3, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ImportQuestionsDialog } from "@/components/pulse/ImportQuestionsDialog";
import { AssignAudienceDialog } from "@/components/pulse/AssignAudienceDialog";
import { useAudience } from "@/hooks/usePulseTargeting";
import { useNavigate } from "react-router-dom";

type Survey = {
  id: string;
  title: string;
  description?: string;
  audience: "company" | "department" | "community" | "custom";
  is_anonymous: boolean;
  status: "draft" | "running" | "closed";
  starts_at?: string | null;
  ends_at?: string | null;
};

type Question = {
  id: string;
  survey_id: string;
  order_index: number;
  kind: "scale" | "nps" | "single" | "multi" | "text";
  title: string;
  options?: string[] | null;
  is_required: boolean;
};

type Response = { id: string; survey_id: string; question_id: string; user_id?: string | null; value_number?: number | null; value_text?: string | null };

const KIND_LABEL: Record<Question["kind"], string> = {
  scale: "Шкала 1–5",
  nps: "NPS 0–10",
  single: "Один из списка",
  multi: "Несколько из списка",
  text: "Свободный ответ",
};

export default function PulseSurveys() {
  const { data: profile } = useUserProfile();
  const role = usePrimaryRole();
  const companyId = profile?.company_id ?? null;
  const userId = profile?.user_id ?? null;
  const isHR = ["hrd", "company_admin", "superadmin"].includes(role);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [qOpen, setQOpen] = useState(false);

  const { data: surveys = [] } = useQuery({
    queryKey: ["pulse-surveys", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await laravelDb.from("pulse_surveys" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[] as Survey[]) ?? [];
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["pulse-questions", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await laravelDb.from("pulse_survey_questions" as any).select("*").eq("survey_id", selected!).order("order_index");
      if (error) throw error;
      return (data as any[] as Question[]) ?? [];
    },
  });

  const { data: responses = [] } = useQuery({
    queryKey: ["pulse-responses", selected],
    enabled: !!selected && isHR,
    queryFn: async () => {
      const { data, error } = await laravelDb.from("pulse_survey_responses" as any).select("*").eq("survey_id", selected!);
      if (error) throw error;
      return (data as any[] as Response[]) ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (patch: Partial<Survey>) => {
      const { data, error } = await laravelDb.from("pulse_surveys" as any).insert({
        company_id: companyId, created_by: userId, status: "draft", is_anonymous: true, audience: "company", ...patch,
      }).select().single();
      if (error) throw error;
      return data as unknown as Survey;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["pulse-surveys"] });
      setSelected(row.id); setCreateOpen(false);
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Survey["status"] }) => {
      const patch: any = { status };
      if (status === "running") patch.starts_at = new Date().toISOString();
      if (status === "closed") patch.ends_at = new Date().toISOString();
      const { error } = await laravelDb.from("pulse_surveys" as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pulse-surveys"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("pulse_surveys" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pulse-surveys"] }); setSelected(null); },
  });

  const addQuestion = useMutation({
    mutationFn: async (patch: Partial<Question>) => {
      const { error } = await laravelDb.from("pulse_survey_questions" as any).insert({
        company_id: companyId, survey_id: selected, order_index: questions.length,
        kind: "scale", is_required: true, ...patch,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pulse-questions", selected] }); setQOpen(false); },
  });

  const submitAnswer = useMutation({
    mutationFn: async ({ questionId, value }: { questionId: string; value: number | string }) => {
      const patch: any = { company_id: companyId, survey_id: selected, question_id: questionId };
      if (typeof value === "number") patch.value_number = value; else patch.value_text = value;
      if (!currentSurvey?.is_anonymous) patch.user_id = userId;
      const { error } = await laravelDb.from("pulse_survey_responses" as any).insert(patch);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Спасибо за ответ"),
    onError: (e: any) => toast.error(e?.message ?? "Не удалось отправить"),
  });

  const currentSurvey = useMemo(() => surveys.find((s) => s.id === selected) ?? null, [surveys, selected]);

  const stats = useMemo(() => {
    const byQ: Record<string, { count: number; avg: number | null }> = {};
    for (const q of questions) {
      const rs = responses.filter((r) => r.question_id === q.id);
      const nums = rs.map((r) => r.value_number).filter((n): n is number => typeof n === "number");
      byQ[q.id] = { count: rs.length, avg: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null };
    }
    return byQ;
  }, [questions, responses]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary shrink-0" />
            Pulse-опросы
          </h1>
          <p className="text-sm text-muted-foreground">Замеры вовлеченности, eNPS и настроений</p>
        </div>
        {isHR && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" />Новый опрос</Button>
            </DialogTrigger>
            <CreateSurveyDialog onSubmit={(v) => create.mutate(v)} />
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Опросы</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {surveys.length === 0 && <p className="text-sm text-muted-foreground">Пока пусто</p>}
            {surveys.map((s) => (
              <button key={s.id} onClick={() => setSelected(s.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${selected === s.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="font-medium truncate min-w-0">{s.title}</span>
                  <Badge variant={s.status === "running" ? "default" : "outline"} className="shrink-0">{s.status}</Badge>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 space-y-0">
            <CardTitle className="text-base truncate min-w-0">{currentSurvey?.title ?? "Выберите опрос"}</CardTitle>
            {currentSurvey && isHR && (
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                {currentSurvey.status === "draft" && (
                  <Button size="sm" className="flex-1 sm:flex-none" onClick={() => setStatus.mutate({ id: currentSurvey.id, status: "running" })}>
                    <Play className="w-3 h-3 mr-1" />Запустить
                  </Button>
                )}
                {currentSurvey.status === "running" && (
                  <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => setStatus.mutate({ id: currentSurvey.id, status: "closed" })}>
                    <Square className="w-3 h-3 mr-1" />Закрыть
                  </Button>
                )}
                <Dialog open={qOpen} onOpenChange={setQOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="flex-1 sm:flex-none"><Plus className="w-3 h-3 mr-1" />Вопрос</Button>
                  </DialogTrigger>
                  <AddQuestionDialog onSubmit={(v) => addQuestion.mutate(v)} />
                </Dialog>
                <Button size="sm" variant="ghost" className="shrink-0" onClick={() => remove.mutate(currentSurvey.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {!currentSurvey && <p className="text-sm text-muted-foreground">Слева выберите опрос</p>}
            {currentSurvey && questions.length === 0 && <p className="text-sm text-muted-foreground">Добавьте вопросы</p>}
            {questions.map((q, i) => (
              <div key={q.id} className="p-4 rounded-lg border space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{i + 1}</Badge>
                  <span className="font-medium">{q.title}</span>
                  <Badge variant="outline" className="ml-auto">{KIND_LABEL[q.kind]}</Badge>
                </div>
                {isHR ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BarChart3 className="w-3 h-3" />
                    {stats[q.id]?.count ?? 0} ответов
                    {stats[q.id]?.avg !== null && <span>· среднее {stats[q.id].avg!.toFixed(1)}</span>}
                  </div>
                ) : currentSurvey?.status === "running" ? (
                  <AnswerControl q={q} onSubmit={(v) => submitAnswer.mutate({ questionId: q.id, value: v })} />
                ) : (
                  <p className="text-xs text-muted-foreground">Опрос не активен</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AnswerControl({ q, onSubmit }: { q: Question; onSubmit: (v: number | string) => void }) {
  const [text, setText] = useState("");
  if (q.kind === "scale" || q.kind === "nps") {
    const max = q.kind === "nps" ? 10 : 5;
    const min = q.kind === "nps" ? 0 : 1;
    const vals = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    return (
      <div className="flex gap-1 flex-wrap">
        {vals.map((v) => (
          <Button key={v} size="sm" variant="outline" onClick={() => onSubmit(v)}>{v}</Button>
        ))}
      </div>
    );
  }
  if (q.kind === "single" || q.kind === "multi") {
    return (
      <div className="space-y-1">
        {(q.options ?? []).map((opt, i) => (
          <Button key={i} size="sm" variant="outline" className="w-full justify-start" onClick={() => onSubmit(opt)}>{opt}</Button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Input value={text} onChange={(e) => setText(e.target.value)} />
      <Button size="sm" disabled={!text.trim()} onClick={() => { onSubmit(text); setText(""); }}>Ответить</Button>
    </div>
  );
}

function CreateSurveyDialog({ onSubmit }: { onSubmit: (v: Partial<Survey>) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [anon, setAnon] = useState(true);
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Новый pulse-опрос</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Название</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label>Описание</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
          Анонимный
        </label>
      </div>
      <DialogFooter>
        <Button disabled={!title.trim()} onClick={() => onSubmit({ title, description, is_anonymous: anon })}>Создать</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AddQuestionDialog({ onSubmit }: { onSubmit: (v: Partial<Question>) => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Question["kind"]>("scale");
  const [opts, setOpts] = useState("");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Новый вопрос</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Формулировка</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div>
          <Label>Тип</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as Question["kind"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(KIND_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {(kind === "single" || kind === "multi") && (
          <div>
            <Label>Варианты (через запятую)</Label>
            <Input value={opts} onChange={(e) => setOpts(e.target.value)} placeholder="Да, Нет, Не знаю" />
          </div>
        )}
      </div>
      <DialogFooter>
        <Button disabled={!title.trim()} onClick={() => onSubmit({
          title, kind,
          options: (kind === "single" || kind === "multi") ? opts.split(",").map((s) => s.trim()).filter(Boolean) : null,
        })}>Добавить</Button>
      </DialogFooter>
    </DialogContent>
  );
}
