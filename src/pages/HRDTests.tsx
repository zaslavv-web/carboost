import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, FileText, Trash2, Power, PowerOff, Eye } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";

interface ParsedQuestion {
  id: string;
  text: string;
  competency: string;
  options: { id: string; text: string }[];
  correct_option_id: string;
  weight?: number;
}

const HRDTests = () => {
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

  const { data: tests = [] } = useQuery({
    queryKey: ["hrd_tests", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await supabase
        .from("closed_question_tests")
        .select("id, title, description, is_active, position_id, source_file_name, questions, created_at")
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
      const { data, error } = await supabase
        .from("positions")
        .select("id, title")
        .eq("company_id", profile.company_id)
        .order("title");
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  const positionTitle = useMemo(
    () => (id: string | null) => positions.find((p) => p.id === id)?.title || "Все должности",
    [positions]
  );

  const handleParse = async () => {
    if (!file || !user || !profile?.company_id) {
      toast.error("Выберите файл");
      return;
    }
    setParsing(true);
    try {
      // Upload to storage
      const ext = file.name.split(".").pop() || "bin";
      const path = `${profile.company_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("hrd-tests").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("hrd-tests").createSignedUrl(path, 60 * 30);
      if (!signed?.signedUrl) throw new Error("Не удалось получить ссылку на файл");

      // Parse via edge function
      const { data, error } = await supabase.functions.invoke("parse-test-document", {
        body: { fileUrl: signed.signedUrl, fileName: file.name },
      });
      if (error) throw error;
      if (!data?.questions?.length) throw new Error("AI не нашёл закрытых вопросов с правильными ответами");

      // Insert test
      const { data: inserted, error: insErr } = await supabase
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

      toast.success(`Загружено ${data.questions.length} вопросов`);
      setFile(null);
      setTitle("");
      setDescription("");
      setPositionId("");
      setPreviewQuestions(inserted.questions as any);
      setPreviewTestId(inserted.id);
      queryClient.invalidateQueries({ queryKey: ["hrd_tests"] });
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Ошибка обработки файла");
    }
    setParsing(false);
  };

  const toggleActive = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("closed_question_tests").update({ is_active: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hrd_tests"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteTest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("closed_question_tests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Тест удалён");
      queryClient.invalidateQueries({ queryKey: ["hrd_tests"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="max-w-5xl mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Тесты с закрытыми вопросами</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Загрузите Excel или PDF — AI извлечёт вопросы, варианты и правильные ответы. Сотрудники будут проходить активные тесты.
        </p>
      </div>

      {/* Upload form */}
      <div className="bg-card rounded-xl border border-border p-5 shadow-card">
        <h2 className="text-base font-semibold text-foreground mb-4">Загрузить новый тест</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-foreground">Название (необязательно)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="AI заполнит из файла"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Привязать к должности (опционально)</label>
            <select
              value={positionId}
              onChange={(e) => setPositionId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— Все должности —</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-foreground">Описание (необязательно)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-foreground">Файл теста (Excel .xlsx, .csv или PDF, .docx)</label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm"
            />
            {file && <p className="mt-1 text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(0)} КБ</p>}
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleParse}
            disabled={!file || parsing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {parsing ? "Обрабатываем..." : "Загрузить и распарсить"}
          </button>
        </div>
      </div>

      {/* Preview */}
      {previewQuestions.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground">Предпросмотр ({previewQuestions.length} вопросов)</h2>
            <button onClick={() => { setPreviewQuestions([]); setPreviewTestId(null); }} className="text-xs text-muted-foreground hover:text-foreground">Скрыть</button>
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {previewQuestions.slice(0, 10).map((q, i) => (
              <div key={q.id} className="text-sm border-l-2 border-primary/50 pl-3">
                <p className="font-medium">{i + 1}. {q.text}</p>
                <p className="text-xs text-muted-foreground">Компетенция: {q.competency}</p>
                <ul className="mt-1 space-y-0.5">
                  {q.options.map((o) => (
                    <li key={o.id} className={o.id === q.correct_option_id ? "text-success" : "text-muted-foreground"}>
                      {o.id}) {o.text} {o.id === q.correct_option_id && "✓"}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {previewQuestions.length > 10 && <p className="text-xs text-muted-foreground">…и ещё {previewQuestions.length - 10}</p>}
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Загруженные тесты</h2>
        </div>
        {tests.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Пока нет загруженных тестов. Сотрудники будут получать AI-сгенерированные тесты под их должность.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tests.map((t: any) => (
              <div key={t.id} className="px-5 py-3 flex items-center gap-3">
                <FileText className={`w-5 h-5 ${t.is_active ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {(t.questions?.length || 0)} вопр. · {positionTitle(t.position_id)} · {t.source_file_name || "—"}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${t.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                  {t.is_active ? "Активен" : "Выключен"}
                </span>
                <button
                  onClick={() => { setPreviewQuestions(t.questions || []); setPreviewTestId(t.id); }}
                  title="Просмотр"
                  className="p-2 rounded-lg hover:bg-secondary"
                >
                  <Eye className="w-4 h-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => toggleActive.mutate({ id: t.id, value: !t.is_active })}
                  title={t.is_active ? "Выключить" : "Включить"}
                  className="p-2 rounded-lg hover:bg-secondary"
                >
                  {t.is_active ? <PowerOff className="w-4 h-4 text-muted-foreground" /> : <Power className="w-4 h-4 text-success" />}
                </button>
                <button
                  onClick={() => { if (confirm("Удалить тест?")) deleteTest.mutate(t.id); }}
                  title="Удалить"
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

export default HRDTests;
