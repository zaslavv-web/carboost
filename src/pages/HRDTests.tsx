import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, FileText, Trash2, Power, PowerOff, Eye, Plus, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { laravelDb } from "@/integrations/laravel/db";
import { laravelStorage } from "@/integrations/laravel/storage";
import { aiInvoke } from "@/integrations/laravel/client";

interface ParsedQuestion {
  id: string;
  text: string;
  competency: string;
  options: { id: string; text: string }[];
  correct_option_id: string;
  weight?: number;
}

const HRDTests = () => {
  const { t } = useTranslation("manager");
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [positionId, setPositionId] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [previewQuestions, setPreviewQuestions] = useState<ParsedQuestion[]>([]);
  const [previewTestId, setPreviewTestId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQuestions, setManualQuestions] = useState<ParsedQuestion[]>([]);

  const { data: tests = [] } = useQuery({
    queryKey: ["hrd_tests", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await laravelDb
        .from("closed_question_tests")
        .select("id, title, description, is_active, position_id, audience_rules, assigned_at, source_file_name, questions, created_at")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["positions_for_tests", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await laravelDb
        .from("positions")
        .select("id, title")
        .eq("company_id", profile.company_id)
        .order("title");
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["profiles_for_tests", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await laravelDb.from("profiles").select("user_id, full_name, department, position_id").eq("company_id", profile?.company_id || "").order("full_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });
  const departments = Array.from(new Set(employees.map((employee: any) => employee.department).filter(Boolean))) as string[];

  const positionTitle = useMemo(
    () => (id: string | null) => positions.find((p) => p.id === id)?.title || t("hrdTests.allPositions"),
    [positions, t]
  );

  const handleParse = async () => {
    if (!file || !user || !profile?.company_id) {
      toast.error(t("hrdTests.toast.selectFile"));
      return;
    }
    setParsing(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${profile.company_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await laravelStorage.from("hrd-tests").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: signed } = await laravelStorage.from("hrd-tests").createSignedUrl(path, 60 * 30);
      if (!signed?.signedUrl) throw new Error(t("hrdTests.toast.noFileUrl"));

      const { data, error } = await aiInvoke("parse-test-document", {
        body: { fileUrl: signed.signedUrl, fileName: file.name },
      });
      if (error) throw error;
      if (!data?.questions?.length) throw new Error(t("hrdTests.toast.noQuestions"));

      const { data: inserted, error: insErr } = await laravelDb
        .from("closed_question_tests")
        .insert({
          company_id: profile.company_id,
          position_id: positionId || null,
          title: title || data.title || file.name,
          description: description || data.description || null,
          source_file_url: path,
          source_file_name: file.name,
          questions: data.questions as any,
          created_by: user.id,
          is_active: true,
        })
        .select("id, questions")
        .single();
      if (insErr) throw insErr;

      toast.success(t("hrdTests.toast.uploaded", { count: data.questions.length }));
      setFile(null);
      setTitle("");
      setDescription("");
      setPositionId("");
      setPreviewQuestions(inserted.questions as any);
      setPreviewTestId(inserted.id);
      queryClient.invalidateQueries({ queryKey: ["hrd_tests"] });
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || t("hrdTests.toast.parseError"));
    }
    setParsing(false);
  };

  const toggleActive = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await laravelDb.from("closed_question_tests").update({ is_active: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hrd_tests"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteTest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("closed_question_tests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("hrdTests.toast.deleted"));
      queryClient.invalidateQueries({ queryKey: ["hrd_tests"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveAudience = useMutation({
    mutationFn: async ({ id, audience_rules }: { id: string; audience_rules: Record<string, string[]> }) => {
      const { error } = await laravelDb.from("closed_question_tests").update({ audience_rules, assigned_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Аудитория теста обновлена");
      queryClient.invalidateQueries({ queryKey: ["hrd_tests"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAudienceValue = (item: any, group: "user_ids" | "departments" | "position_ids", value: string) => {
    const current = item.audience_rules || {};
    const values: string[] = current[group] || [];
    saveAudience.mutate({ id: item.id, audience_rules: { ...current, [group]: values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value] } });
  };

  const createManualTest = async () => {
    if (!user || !profile?.company_id || !title.trim() || manualQuestions.length === 0) return;
    const { error } = await laravelDb.from("closed_question_tests").insert({
      company_id: profile.company_id,
      position_id: positionId || null,
      title: title.trim(),
      description: description.trim() || null,
      questions: manualQuestions as any,
      created_by: user.id,
      is_active: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Тест создан");
    setManualQuestions([]);
    setManualOpen(false);
    setTitle("");
    setDescription("");
    setPositionId("");
    queryClient.invalidateQueries({ queryKey: ["hrd_tests"] });
  };

  const addManualQuestion = () => setManualQuestions((current) => [...current, {
    id: crypto.randomUUID(), text: "", competency: "Общие компетенции",
    options: [{ id: "a", text: "" }, { id: "b", text: "" }], correct_option_id: "a", weight: 1,
  }]);

  return (
    <div className="max-w-5xl mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("hrdTests.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("hrdTests.subtitle")}</p>
      </div>

      <div className="flex justify-end">
        <button onClick={() => { setManualOpen((value) => !value); if (!manualOpen && manualQuestions.length === 0) addManualQuestion(); }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
          <Plus className="h-4 w-4" />Создать тест вручную
        </button>
      </div>

      {manualOpen && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold">Вопросы теста</h2>
          {manualQuestions.map((question, questionIndex) => (
            <div key={question.id} className="border border-border rounded-lg p-4 space-y-3">
              <input value={question.text} onChange={(e) => setManualQuestions((all) => all.map((q, i) => i === questionIndex ? { ...q, text: e.target.value } : q))} placeholder="Текст вопроса" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              <input value={question.competency} onChange={(e) => setManualQuestions((all) => all.map((q, i) => i === questionIndex ? { ...q, competency: e.target.value } : q))} placeholder="Компетенция" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              {question.options.map((option, optionIndex) => (
                <label key={option.id} className="flex items-center gap-2">
                  <input type="radio" checked={question.correct_option_id === option.id} onChange={() => setManualQuestions((all) => all.map((q, i) => i === questionIndex ? { ...q, correct_option_id: option.id } : q))} />
                  <input value={option.text} onChange={(e) => setManualQuestions((all) => all.map((q, i) => i === questionIndex ? { ...q, options: q.options.map((o, oi) => oi === optionIndex ? { ...o, text: e.target.value } : o) } : q))} placeholder={`Вариант ${optionIndex + 1}`} className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                </label>
              ))}
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <button onClick={addManualQuestion} className="px-3 py-2 rounded-lg bg-secondary text-sm">Добавить вопрос</button>
            <button onClick={() => void createManualTest()} disabled={!title.trim() || manualQuestions.some((q) => !q.text.trim() || q.options.some((o) => !o.text.trim()))} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50">Сохранить тест</button>
          </div>
        </div>
      )}

      {/* Upload form */}
      <div className="bg-card rounded-xl border border-border p-5 shadow-card">
        <h2 className="text-base font-semibold text-foreground mb-4">{t("hrdTests.uploadSection")}</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-foreground">{t("hrdTests.nameLabel")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("hrdTests.namePlaceholder")}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">{t("hrdTests.positionLabel")}</label>
            <select
              value={positionId}
              onChange={(e) => setPositionId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{t("hrdTests.allPositions")}</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-foreground">{t("hrdTests.descLabel")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-foreground">{t("hrdTests.fileLabel")}</label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm"
            />
            {file && <p className="mt-1 text-xs text-muted-foreground">{t("hrdTests.fileInfo", { name: file.name, size: (file.size / 1024).toFixed(0) })}</p>}
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleParse}
            disabled={!file || parsing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {parsing ? t("hrdTests.processing") : t("hrdTests.uploadBtn")}
          </button>
        </div>
      </div>

      {/* Preview */}
      {previewQuestions.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground">{t("hrdTests.previewTitle", { count: previewQuestions.length })}</h2>
            <button onClick={() => { setPreviewQuestions([]); setPreviewTestId(null); }} className="text-xs text-muted-foreground hover:text-foreground">{t("hrdTests.hide")}</button>
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {previewQuestions.slice(0, 10).map((q, i) => (
              <div key={q.id} className="text-sm border-l-2 border-primary/50 pl-3">
                <p className="font-medium">{i + 1}. {q.text}</p>
                <p className="text-xs text-muted-foreground">{t("hrdTests.competencyLabel")} {q.competency}</p>
                <ul className="mt-1 space-y-0.5">
                  {q.options.map((o) => (
                    <li key={o.id} className={o.id === q.correct_option_id ? "text-success" : "text-muted-foreground"}>
                      {o.id}) {o.text} {o.id === q.correct_option_id && "✓"}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {previewQuestions.length > 10 && <p className="text-xs text-muted-foreground">{t("hrdTests.moreQuestions", { count: previewQuestions.length - 10 })}</p>}
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">{t("hrdTests.listTitle")}</h2>
        </div>
        {tests.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t("hrdTests.empty")}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tests.map((item: any) => (
              <div key={item.id} className="px-5 py-3 flex items-center gap-3">
                <FileText className={`w-5 h-5 ${item.is_active ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {t("hrdTests.questionCount", { count: item.questions?.length || 0 })} · {positionTitle(item.position_id)} · {item.source_file_name || "—"}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${item.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                  {item.is_active ? t("hrdTests.active") : t("hrdTests.inactive")}
                </span>
                <button
                  onClick={() => { setPreviewQuestions(item.questions || []); setPreviewTestId(item.id); }}
                  title={t("hrdTests.previewBtn")}
                  className="p-2 rounded-lg hover:bg-secondary"
                >
                  <Eye className="w-4 h-4 text-muted-foreground" />
                </button>
                <AudienceDialog
                  test={item}
                  departments={departments}
                  positions={positions}
                  employees={employees}
                  onToggle={(group, value) => toggleAudienceValue(item, group, value)}
                />

                <button onClick={() => saveAudience.mutate({ id: item.id, audience_rules: item.audience_rules || {} })} title="Назначить заново" className="p-2 rounded-lg hover:bg-secondary"><RefreshCw className="h-4 w-4 text-muted-foreground" /></button>
                <button
                  onClick={() => toggleActive.mutate({ id: item.id, value: !item.is_active })}
                  title={item.is_active ? t("hrdTests.disableBtn") : t("hrdTests.enableBtn")}
                  className="p-2 rounded-lg hover:bg-secondary"
                >
                  {item.is_active ? <PowerOff className="w-4 h-4 text-muted-foreground" /> : <Power className="w-4 h-4 text-success" />}
                </button>
                <button
                  onClick={() => { if (confirm(t("hrdTests.confirmDelete"))) deleteTest.mutate(item.id); }}
                  title={t("hrdTests.deleteBtn")}
                  className="p-2 rounded-lg hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function AudienceDialog({
  test, departments, positions, employees, onToggle,
}: {
  test: any;
  departments: string[];
  positions: any[];
  employees: any[];
  onToggle: (group: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rules = test.audience_rules || {};
  const total =
    (rules.departments?.length || 0) + (rules.position_ids?.length || 0) + (rules.user_ids?.length || 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          title="Настроить аудиторию"
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
        >
          <Pencil className="h-3.5 w-3.5" />
          Аудитория
          {total > 0 && (
            <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {total}
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Аудитория теста</DialogTitle>
          <DialogDescription className="truncate">{test.title}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1 text-sm">
          <AudienceGroup
            title="Отделы"
            options={departments.map((value) => ({ value, label: value }))}
            selected={rules.departments || []}
            onToggle={(value) => onToggle("departments", value)}
          />
          <AudienceGroup
            title="Должности"
            options={positions.map((position: any) => ({ value: position.id, label: position.title }))}
            selected={rules.position_ids || []}
            onToggle={(value) => onToggle("position_ids", value)}
          />
          <AudienceGroup
            title="Сотрудники"
            options={employees.map((employee: any) => ({ value: employee.user_id, label: employee.full_name }))}
            selected={rules.user_ids || []}
            onToggle={(value) => onToggle("user_ids", value)}
          />
          {total === 0 && (
            <p className="text-xs text-muted-foreground">
              Ничего не выбрано — тест будет доступен всем сотрудникам компании.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Готово</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AudienceGroup({ title, options, selected, onToggle }: { title: string; options: { value: string; label: string }[]; selected: string[]; onToggle: (value: string) => void }) {
  return <fieldset><legend className="mb-1 font-medium text-foreground">{title}</legend><div className="max-h-40 space-y-1 overflow-y-auto rounded border border-border p-2">{options.length === 0 ? <p className="text-xs text-muted-foreground">Нет доступных вариантов</p> : options.map((option) => <label key={option.value} className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={selected.includes(option.value)} onChange={() => onToggle(option.value)} />{option.label}</label>)}</div></fieldset>;
}


export default HRDTests;
