import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { laravelStorage } from "@/integrations/laravel/storage";
import { aiInvoke } from "@/integrations/laravel/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import { Upload, FileJson, Trash2, Loader2, ToggleLeft, ToggleRight, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/dateLocale";
import * as XLSX from "xlsx";
import ScenarioSchemaViewer from "@/components/ScenarioSchemaViewer";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const scenarioSteps = (rows: Array<[string, string, string]>) =>
  rows.map(([stepTitle, duration, stepDescription]) => ({
    title: stepTitle,
    duration,
    description: stepDescription,
  }));

const DEFAULT_ASSESSMENT_SCENARIOS = [
  {
    id: "default-team-lead-assessment",
    title: "Ассессмент руководителя команды",
    description: "Ситуационные задачи на обратную связь, делегирование и принятие решений.",
    is_active: true,
    created_at: new Date().toISOString(),
    scenario_data: {
      title: "Ассессмент руководителя команды",
      brief: "Кандидат управляет командой из 6 человек в условиях сдвинутых сроков.",
      duration: "60 минут",
      audience: "Руководители и кадровый резерв",
      competencies: ["Лидерство", "Делегирование", "Обратная связь", "Принятие решений"],
      steps: scenarioSteps([
        ["Введение и контекст", "5 минут", "Ведущий описывает ситуацию: срыв срока по ключевому проекту."],
        ["Анализ вводных", "15 минут", "Участник изучает данные команды и формулирует корневую причину."],
        ["План действий", "20 минут", "Участник предлагает план восстановления сроков и распределяет роли."],
        ["Ролевая игра", "10 минут", "Разговор 1:1 с демотивированным сотрудником."],
        ["Рефлексия", "10 минут", "Самооценка и обратная связь наблюдателей."],
      ]),
      questions: [
        { question: "Как вы определили ключевую проблему?", criteria: "структурность анализа", max_score: 5 },
        { question: "Какие альтернативы рассматривали?", criteria: "аргументация", max_score: 5 },
        { question: "Как донесёте решение до команды?", criteria: "коммуникация", max_score: 5 },
      ],
    },
  },
  {
    id: "default-client-thinking-assessment",
    title: "Оценка клиентского мышления",
    description: "Практический сценарий работы со сложным запросом внутреннего клиента.",
    is_active: true,
    created_at: new Date().toISOString(),
    scenario_data: {
      title: "Оценка клиентского мышления",
      brief: "Внутренний заказчик требует функциональность вне дорожной карты.",
      duration: "45 минут",
      audience: "Специалисты и менеджеры",
      competencies: ["Клиентоориентированность", "Коммуникация", "Переговоры"],
      steps: scenarioSteps([
        ["Знакомство с запросом", "5 минут", "Участник читает переписку с заказчиком."],
        ["Уточняющие вопросы", "10 минут", "Диалог с ведущим в роли заказчика."],
        ["Предложение решения", "20 минут", "Формулирование компромисса и сроков."],
        ["Обратная связь", "10 минут", "Разбор наблюдателями."],
      ]),
      questions: [
        { question: "Какую задачу заказчика вы решаете на самом деле?", criteria: "выявление потребности", max_score: 5 },
        { question: "Как вы говорите «нет» и сохраняете отношения?", criteria: "переговоры", max_score: 5 },
        { question: "Как зафиксируете договорённости?", criteria: "ответственность", max_score: 5 },
      ],
    },
  },
  {
    id: "default-talent-pool-assessment",
    title: "Центр оценки кадрового резерва",
    description: "Комплексный кейс для участников программы развития.",
    is_active: true,
    created_at: new Date().toISOString(),
    scenario_data: {
      title: "Центр оценки кадрового резерва",
      brief: "Участники проектируют инициативу роста выручки и защищают её перед комитетом.",
      duration: "90 минут",
      audience: "HiPo и кадровый резерв",
      competencies: ["Стратегическое мышление", "Работа в команде", "Развитие людей"],
      steps: scenarioSteps([
        ["Командный брифинг", "10 минут", "Распределение ролей и уточнение цели кейса."],
        ["Анализ данных", "25 минут", "Поиск ограничений, рисков и точек роста."],
        ["Проектирование инициативы", "30 минут", "Сборка плана, метрик успеха и ресурсов."],
        ["Защита решения", "15 минут", "Презентация перед наблюдателями и ответы на вопросы."],
        ["Индивидуальная обратная связь", "10 минут", "Фиксация сильных сторон и зон развития."],
      ]),
      questions: [
        { question: "Какие метрики докажут успех инициативы?", criteria: "ориентация на результат", max_score: 5 },
        { question: "Как распределили роли в команде?", criteria: "командность", max_score: 5 },
        { question: "Какие риски требуют эскалации?", criteria: "управление рисками", max_score: 5 },
      ],
    },
  },
];

const Scenarios = () => {
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation("admin");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [viewingSchema, setViewingSchema] = useState<any | null>(null);

  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ["assessment_scenarios"],
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("assessment_scenarios")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data?.length ? data : DEFAULT_ASSESSMENT_SCENARIOS;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error(t("scenarios.uploadTitle"));

      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      let parsed: any;

      if (ext === ".json") {
        const text = await file.text();
        parsed = JSON.parse(text);
      } else if (ext === ".csv") {
        const text = await file.text();
        const lines = text.split("\n").filter(Boolean);
        const headers = lines[0].split(",").map((h) => h.trim());
        parsed = lines.slice(1).map((line) => {
          const vals = line.split(",").map((v) => v.trim());
          return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
        });
      } else if (ext === ".xlsx" || ext === ".xls") {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        parsed = XLSX.utils.sheet_to_json(firstSheet);
      } else if (ext === ".docx" || ext === ".pdf") {
        // Upload to storage and parse with AI
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `scenarios/${Date.now()}_${safeName}`;
        const { error: uploadError } = await laravelStorage.from("hr-documents").upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: signedData, error: signError } = await laravelStorage.from("hr-documents").createSignedUrl(filePath, 600);
        if (signError || !signedData?.signedUrl) throw signError || new Error("URL error");

        const { data: result, error: fnError } = await aiInvoke("parse-hr-document", {
          body: {
            documentId: null,
            fileUrl: signedData.signedUrl,
            fileName: file.name,
            documentType: "scenario_upload",
          },
        });
        if (fnError) throw fnError;
        parsed = result?.data?.scenario || result?.data || result;
      } else {
        throw new Error(t("scenarios.formatsHint"));
      }

      const { error } = await laravelDb.from("assessment_scenarios").insert({
        title: title || file.name,
        description,
        scenario_data: parsed,
        created_by: user!.id,
        company_id: profile?.company_id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment_scenarios"] });
      toast.success(t("scenarios.toastUploaded"));
      setTitle("");
      setDescription("");
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await laravelDb
        .from("assessment_scenarios")
        .update({ is_active: active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment_scenarios"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("assessment_scenarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment_scenarios"] });
      toast.success(t("scenarios.toastDeleted"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("scenarios.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("scenarios.subtitle")}</p>
      </div>

      {/* Upload form */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <h3 className="font-semibold text-foreground">{t("scenarios.uploadTitle")}</h3>
        <p className="text-xs text-muted-foreground">{t("scenarios.formatsHint")}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("scenarios.namePlaceholder")}
            className="px-4 py-2.5 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("scenarios.descPlaceholder")}
            className="px-4 py-2.5 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <div className="flex items-center gap-4">
          <input ref={fileRef} type="file" accept=".json,.csv,.xlsx,.xls,.docx,.pdf" className="text-sm text-muted-foreground file:mr-3 file:px-4 file:py-2 file:rounded-lg file:bg-secondary file:text-foreground file:text-sm file:font-medium file:border-0 file:cursor-pointer" />
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {t("scenarios.uploadBtn")}
          </Button>
        </div>
      </div>

      {/* Scenarios list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : scenarios.length === 0 ? (
        <div className="text-center py-16">
          <FileJson className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">{t("scenarios.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {scenarios.map((s: any) => (
            <div key={s.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <FileJson className="w-8 h-8 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {Array.isArray(s.scenario_data) ? t("scenarios.elements", { count: s.scenario_data.length }) : t("scenarios.dataLoaded")} · {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: getDateLocale() })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  onClick={() => setViewingSchema(s)}
                  variant="ghost"
                  size="icon"
                  title={t("common:view", { defaultValue: "View" })}
                >
                  <Eye className="w-5 h-5" />
                </Button>
                <Button
                  onClick={() => toggleMutation.mutate({ id: s.id, active: !s.is_active })}
                  variant="ghost"
                  size="icon"
                  disabled={String(s.id).startsWith("default-")}
                  className={s.is_active ? "text-success hover:bg-success/10" : "text-muted-foreground hover:bg-secondary"}
                  title={s.is_active ? t("common:active", { defaultValue: "Active" }) : t("common:inactive", { defaultValue: "Inactive" })}
                >
                  {s.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </Button>
                <Button
                  onClick={() => deleteMutation.mutate(s.id)}
                  variant="ghost"
                  size="icon"
                  disabled={String(s.id).startsWith("default-")}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingSchema && (
        <ScenarioSchemaViewer scenario={viewingSchema} onClose={() => setViewingSchema(null)} />
      )}
    </div>
  );
};

export default Scenarios;
