import { useState, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import {
  ReactFlow, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState,
  type Connection, type Node, type Edge, MarkerType, Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { eightBlockJobProfileGuide, miningPilotProfiles } from "@/data/jobProfileTemplates";
import {
  Plus, Save, Trash2, Loader2, X, Upload, FileUp, Brain, Target, Sparkles, ArrowRight,
} from "lucide-react";

interface Position {
  id: string;
  title: string;
  description: string | null;
  department: string | null;
  psychological_profile: any;
  competency_profile: any;
  profile_status?: string;
  profile_template?: any;
}

interface CareerPath {
  id: string;
  from_position_id: string;
  to_position_id: string;
  strategy_description: string | null;
  requirements: any;
  estimated_months: number | null;
}

interface CompetencyItem {
  name: string;
  required_level: number;
  category?: string;
  critical_threshold?: number;
  behavioral_indicators?: Record<string, string[]>;
}

interface PsychItem {
  trait: string;
  level: string;
}

// ── Structured Competency Editor ──
const CompetencyProfileEditor = ({
  value,
  onChange,
}: {
  value: CompetencyItem[];
  onChange: (v: CompetencyItem[]) => void;
}) => {
  const add = () => onChange([...value, { name: "", required_level: 5 }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const update = (i: number, field: keyof CompetencyItem, val: any) =>
    onChange(value.map((item, idx) => (idx === i ? { ...item, [field]: val } : item)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Target className="w-4 h-4 text-primary" /> Профиль компетенций
        </label>
        <Button variant="ghost" size="sm" onClick={add} type="button">
          <Plus className="w-3 h-3" /> Добавить
        </Button>
      </div>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">Нет компетенций. Добавьте вручную или загрузите из файла.</p>
      )}
      {value.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={item.name}
            onChange={(e) => update(i, "name", e.target.value)}
            placeholder="Название компетенции"
            className="flex-1 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <div className="flex items-center gap-1.5">
            <input
              type="range"
              min={1}
              max={10}
              value={item.required_level}
              onChange={(e) => update(i, "required_level", Number(e.target.value))}
              className="w-20 accent-primary"
            />
            <span className="text-xs font-semibold text-foreground w-5 text-center">{item.required_level}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => remove(i)} className="text-destructive h-7 w-7">
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}
    </div>
  );
};

// ── Structured Psychological Profile Editor ──
const PsychProfileEditor = ({
  value,
  onChange,
}: {
  value: PsychItem[];
  onChange: (v: PsychItem[]) => void;
}) => {
  const levels = ["низкое", "ниже среднего", "среднее", "выше среднего", "высокое"];
  const add = () => onChange([...value, { trait: "", level: "среднее" }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const update = (i: number, field: keyof PsychItem, val: string) =>
    onChange(value.map((item, idx) => (idx === i ? { ...item, [field]: val } : item)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Brain className="w-4 h-4 text-primary" /> Психологический портрет-эталон
        </label>
        <Button variant="ghost" size="sm" onClick={add} type="button">
          <Plus className="w-3 h-3" /> Добавить
        </Button>
      </div>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">Нет характеристик. Добавьте вручную или загрузите из файла.</p>
      )}
      {value.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={item.trait}
            onChange={(e) => update(i, "trait", e.target.value)}
            placeholder="Черта (напр. Лидерство)"
            className="flex-1 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <select
            value={item.level}
            onChange={(e) => update(i, "level", e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          >
            {levels.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <Button variant="ghost" size="icon" onClick={() => remove(i)} className="text-destructive h-7 w-7">
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}
    </div>
  );
};

// ── Parse helpers for profiles ──
const parseCompetencyProfile = (raw: any): CompetencyItem[] => {
  if (Array.isArray(raw)) return raw.filter((r: any) => r.name);
  return [];
};

const parsePsychProfile = (raw: any): PsychItem[] => {
  if (Array.isArray(raw)) return raw.filter((r: any) => r.trait);
  if (typeof raw === "object" && raw !== null) {
    return Object.entries(raw).map(([trait, level]) => ({ trait, level: String(level) }));
  }
  return [];
};

// ── Position Editor Modal ──
const PositionEditor = ({
  position,
  onClose,
  onSave,
  isSaving,
}: {
  position: Position | null;
  onClose: () => void;
  onSave: (data: Partial<Position>) => void;
  isSaving: boolean;
}) => {
  const [title, setTitle] = useState(position?.title || "");
  const [description, setDescription] = useState(position?.description || "");
  const [department, setDepartment] = useState(position?.department || "");
  const [profileStatus, setProfileStatus] = useState(position?.profile_status || "draft");
  const [profileTemplate, setProfileTemplate] = useState<any>(position?.profile_template || {});
  const [competencies, setCompetencies] = useState<CompetencyItem[]>(
    parseCompetencyProfile(position?.competency_profile)
  );
  const [psychTraits, setPsychTraits] = useState<PsychItem[]>(
    parsePsychProfile(position?.psychological_profile)
  );
  const [parsing, setParsing] = useState(false);
  const [loadingFromDocs, setLoadingFromDocs] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyTemplate = (template: any) => {
    setTitle(template.title || title);
    setDepartment(template.department || department);
    setDescription(template.mission || description);
    setCompetencies(template.competencies || []);
    setProfileTemplate(template);
    toast.success("Шаблон профиля применён");
  };

  // Load competencies from HR documents uploaded by HRD (matched by department/title)
  const loadFromHrDocuments = async () => {
    setLoadingFromDocs(true);
    try {
      const { data: docs, error } = await supabase
        .from("hr_documents")
        .select("title, document_type, extracted_data")
        .eq("processing_status", "completed")
        .not("extracted_data", "is", null);
      if (error) throw error;

      const collected = new Map<string, number>();
      const collectedPsych = new Map<string, string>();
      const titleLc = title.toLowerCase();
      const deptLc = department.toLowerCase();

      (docs || []).forEach((d: any) => {
        const data = d.extracted_data;
        if (!data) return;
        const docTitle = (d.title || "").toLowerCase();
        // Filter: doc relevant if it mentions position title or department
        const relevant =
          !titleLc && !deptLc
            ? true
            : (titleLc && docTitle.includes(titleLc)) ||
              (deptLc && docTitle.includes(deptLc)) ||
              d.document_type === "competency_model";

        if (!relevant) return;

        const comps = Array.isArray(data.competencies) ? data.competencies : [];
        comps.forEach((c: any) => {
          if (!c?.name) return;
          const lvl = Number(c.required_level) || 5;
          // Take max non-zero level across docs
          const safeLvl = lvl > 0 ? lvl : 5;
          collected.set(c.name, Math.max(collected.get(c.name) || 0, safeLvl));
        });

        const psych = Array.isArray(data.psychological_profile) ? data.psychological_profile : [];
        psych.forEach((p: any) => {
          if (p?.trait) collectedPsych.set(p.trait, p.level || "среднее");
        });
      });

      if (collected.size === 0) {
        toast.error("В загруженных HR-документах нет подходящих компетенций. Загрузите модель компетенций в разделе HR-документы.");
        return;
      }

      const newComps: CompetencyItem[] = Array.from(collected.entries()).map(([name, required_level]) => ({
        name,
        required_level: required_level > 0 ? required_level : 5,
      }));
      const newPsych: PsychItem[] = Array.from(collectedPsych.entries()).map(([trait, level]) => ({ trait, level }));

      setCompetencies(newComps);
      if (newPsych.length > 0) setPsychTraits(newPsych);
      toast.success(`Подгружено ${newComps.length} компетенций из HR-документов`);
    } catch (e: any) {
      toast.error(e.message || "Ошибка загрузки из HR-документов");
    } finally {
      setLoadingFromDocs(false);
    }
  };

  const handleFileUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (![".doc", ".docx", ".pdf", ".csv", ".json", ".xlsx", ".xls"].includes(ext)) {
      toast.error("Поддерживаются DOC, DOCX, PDF, CSV, XLSX и JSON");
      return;
    }

    setParsing(true);
    try {
      if (ext === ".json") {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (parsed.competencies) setCompetencies(parsed.competencies);
        if (parsed.psychological_profile) setPsychTraits(
          Array.isArray(parsed.psychological_profile)
            ? parsed.psychological_profile
            : Object.entries(parsed.psychological_profile).map(([trait, level]) => ({ trait, level: String(level) }))
        );
        toast.success("Эталон загружен из JSON");
      } else if (ext === ".csv") {
        const text = await file.text();
        const lines = text.split("\n").filter(Boolean);
        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const nameIdx = headers.findIndex((h) => h.includes("name") || h.includes("компетенц") || h.includes("навык"));
        const levelIdx = headers.findIndex((h) => h.includes("level") || h.includes("уровень"));
        if (nameIdx >= 0) {
          const items = lines.slice(1).map((line) => {
            const vals = line.split(",").map((v) => v.trim());
            return { name: vals[nameIdx] || "", required_level: parseInt(vals[levelIdx] || "5") || 5 };
          }).filter((c) => c.name);
          setCompetencies(items);
          toast.success(`Загружено ${items.length} компетенций из CSV`);
        } else {
          toast.error("CSV должен содержать столбец с названием компетенции");
        }
      } else if (ext === ".xlsx" || ext === ".xls") {
        // Parse XLSX client-side
        const XLSX = (await import("xlsx"));
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(firstSheet);
        const headers = Object.keys(rows[0] || {}).map(h => h.toLowerCase());
        const nameKey = Object.keys(rows[0] || {}).find(h => {
          const lh = h.toLowerCase();
          return lh.includes("name") || lh.includes("компетенц") || lh.includes("навык");
        });
        const levelKey = Object.keys(rows[0] || {}).find(h => {
          const lh = h.toLowerCase();
          return lh.includes("level") || lh.includes("уровень");
        });
        if (nameKey) {
          const items = rows.map(r => ({
            name: String(r[nameKey] || ""),
            required_level: parseInt(String(r[levelKey!] || "5")) || 5,
          })).filter(c => c.name);
          setCompetencies(items);
          toast.success(`Загружено ${items.length} компетенций из XLSX`);
        } else {
          toast.error("XLSX должен содержать столбец с названием компетенции");
        }
      } else {
        // For doc/docx/pdf — upload and parse with AI
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `standards/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase.storage.from("hr-documents").upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: signedData, error: signError } = await supabase.storage.from("hr-documents").createSignedUrl(filePath, 600);
        if (signError || !signedData?.signedUrl) throw signError || new Error("Не удалось создать ссылку на файл");

        const { data: result, error: fnError } = await supabase.functions.invoke("parse-position-standards", {
          body: { fileUrl: signedData.signedUrl, fileName: file.name },
        });
        if (fnError) throw fnError;

        if (result?.competencies?.length) {
          setCompetencies(result.competencies);
        }
        if (result?.psychological_profile?.length) {
          setPsychTraits(result.psychological_profile);
        }
        toast.success("Эталон извлечён из документа с помощью AI");
      }
    } catch (e: any) {
      toast.error(e.message || "Ошибка обработки файла");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {position ? "Редактирование должности" : "Новая должность"}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        {/* Basic info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">Название</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              placeholder="Frontend разработчик" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Отдел</label>
            <input value={department} onChange={(e) => setDepartment(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Описание</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 min-h-[50px]" />
        </div>

        <div className="bg-primary/5 rounded-lg border border-primary/20 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Skills-based шаблон 8 блоков</p>
            <p className="text-xs text-muted-foreground mt-1">
              {eightBlockJobProfileGuide.rules[0]} {eightBlockJobProfileGuide.rules[2]}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" type="button" onClick={() => setProfileTemplate({ ...profileTemplate, methodology: eightBlockJobProfileGuide.rules, blocks: eightBlockJobProfileGuide.blocks, generation_source: "manual", review_frequency: "12 месяцев или при изменении технологии/стратегии" })}>
              Применить 8 блоков
            </Button>
            {miningPilotProfiles.map((template) => (
              <Button key={template.title} size="sm" variant="secondary" type="button" onClick={() => applyTemplate(template)}>
                {template.title}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">Статус эталона</label>
            <select value={profileStatus} onChange={(e) => setProfileStatus(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20">
              <option value="draft">Черновик</option>
              <option value="review">На ревью</option>
              <option value="approved">Утверждён</option>
              <option value="archived">Архив</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Цели и метрики успеха</label>
            <input value={profileTemplate.success_metrics || ""} onChange={(e) => setProfileTemplate({ ...profileTemplate, success_metrics: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              placeholder="KPI, ожидаемые результаты" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">Источник генерации</label>
            <select value={profileTemplate.generation_source || "manual"} onChange={(e) => setProfileTemplate({ ...profileTemplate, generation_source: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20">
              <option value="manual">Ручное заполнение</option>
              <option value="vacancy">Из вакансии компании</option>
              <option value="market">Из рыночного бенчмарка</option>
              <option value="psychological">Из психологического портрета</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Грейд</label>
            <input value={profileTemplate.grade || ""} onChange={(e) => setProfileTemplate({ ...profileTemplate, grade: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Частота пересмотра</label>
            <input value={profileTemplate.review_frequency || ""} onChange={(e) => setProfileTemplate({ ...profileTemplate, review_frequency: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              placeholder="12 месяцев" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">Основные обязанности</label>
            <textarea value={profileTemplate.responsibilities || ""} onChange={(e) => setProfileTemplate({ ...profileTemplate, responsibilities: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 min-h-[70px]" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Опыт, образование и риски</label>
            <textarea value={profileTemplate.requirements_and_risks || ""} onChange={(e) => setProfileTemplate({ ...profileTemplate, requirements_and_risks: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 min-h-[70px]" />
          </div>
        </div>

        {/* File upload for standards */}
        <div className="bg-secondary/30 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <FileUp className="w-4 h-4 text-primary" /> Загрузить эталон из файла
          </p>
           <p className="text-xs text-muted-foreground">
             Загрузите DOC, DOCX, PDF, XLSX — AI извлечёт компетенции и психопортрет. Или CSV/JSON для прямого импорта.
           </p>
           <div className="flex flex-wrap items-center gap-3">
             <input ref={fileRef} type="file" accept=".doc,.docx,.pdf,.csv,.json,.xlsx,.xls"
               className="text-sm text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:bg-secondary file:text-foreground file:text-xs file:font-medium file:border-0 file:cursor-pointer" />
            <Button size="sm" onClick={handleFileUpload} disabled={parsing}>
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Распознать
            </Button>
            <Button size="sm" variant="outline" onClick={loadFromHrDocuments} disabled={loadingFromDocs} type="button">
              {loadingFromDocs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Подтянуть из HR-документов
            </Button>
          </div>
        </div>

        {/* Competency editor */}
        <CompetencyProfileEditor value={competencies} onChange={setCompetencies} />

        {/* Psych profile editor */}
        <PsychProfileEditor value={psychTraits} onChange={setPsychTraits} />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button
            onClick={() => {
              if (competencies.length === 0) {
                toast.error("Добавьте хотя бы одну компетенцию для эталона должности");
                return;
              }
              const invalid = competencies.filter((c) => !c.name.trim() || !c.required_level || c.required_level <= 0);
              if (invalid.length > 0) {
                toast.error("Все компетенции должны иметь название и ненулевой требуемый уровень (1–10)");
                return;
              }
              const psychObj = psychTraits.length > 0 ? psychTraits : {};
              onSave({
                title,
                description: description || null,
                department: department || null,
                competency_profile: competencies,
                psychological_profile: psychObj,
                profile_status: profileStatus,
                profile_template: {
                  ...profileTemplate,
                  metadata: { title, department },
                  competencies,
                  psychological_profile: psychObj,
                  career_growth: profileTemplate.career_growth || "",
                },
              });
            }}
            disabled={!title || isSaving}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
};

// ── Org Structure Upload ──
const OrgStructureUpload = () => {
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [generatingPositions, setGeneratingPositions] = useState(false);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const createPositionsFromData = async (positions: any[]) => {
    let created = 0;
    for (const pos of positions) {
      const { error } = await supabase.from("positions").insert({
        title: pos.title,
        department: pos.department || null,
        description: pos.description || null,
        competency_profile: pos.competency_profile || [],
        psychological_profile: pos.psychological_profile || [],
        created_by: user!.id,
        company_id: profile?.company_id || null,
      } as any);
      if (!error) created++;
    }
    return created;
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error("Выберите файл");
      if (!profile?.company_id) throw new Error("У вашего профиля не указана компания. Обратитесь к администратору для привязки к компании.");
      setUploading(true);

      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      let deptRows: { name: string; description?: string; parent?: string }[] = [];
      let extractedPositions: any[] = [];

      if (ext === ".csv") {
        const text = await file.text();
        const lines = text.split("\n").filter(Boolean);
        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const nameIdx = headers.findIndex((h) => h.includes("name") || h.includes("название") || h.includes("отдел"));
        const descIdx = headers.findIndex((h) => h.includes("desc") || h.includes("описание"));
        const parentIdx = headers.findIndex((h) => h.includes("parent") || h.includes("родител"));
        if (nameIdx < 0) throw new Error("CSV должен содержать столбец с названием отдела");
        deptRows = lines.slice(1).map((line) => {
          const vals = line.split(",").map((v) => v.trim());
          return { name: vals[nameIdx] || "", description: descIdx >= 0 ? vals[descIdx] : undefined, parent: parentIdx >= 0 ? vals[parentIdx] : undefined };
        }).filter((d) => d.name);
      } else if (ext === ".xlsx" || ext === ".xls") {
        // Try client-side parsing first, fall back to AI
        const XLSX = (await import("xlsx"));
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(firstSheet);
        const nameKey = Object.keys(rows[0] || {}).find(h => { const lh = h.toLowerCase(); return lh.includes("name") || lh.includes("название") || lh.includes("отдел"); });
        if (nameKey) {
          const descKey = Object.keys(rows[0] || {}).find(h => { const lh = h.toLowerCase(); return lh.includes("desc") || lh.includes("описание"); });
          const parentKey = Object.keys(rows[0] || {}).find(h => { const lh = h.toLowerCase(); return lh.includes("parent") || lh.includes("родител"); });
          deptRows = rows.map(r => ({ name: String(r[nameKey] || ""), description: descKey ? String(r[descKey] || "") : undefined, parent: parentKey ? String(r[parentKey] || "") : undefined })).filter(d => d.name);
        } else {
          // Column not found — send to AI for parsing
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const filePath = `orgstructure/${Date.now()}_${safeName}`;
          const { error: uploadError } = await supabase.storage.from("hr-documents").upload(filePath, file);
          if (uploadError) throw uploadError;
          const { data: signedData, error: signError } = await supabase.storage.from("hr-documents").createSignedUrl(filePath, 600);
          if (signError || !signedData?.signedUrl) throw signError || new Error("Не удалось создать ссылку на файл");
          const { data: result, error: fnError } = await supabase.functions.invoke("parse-org-structure", {
            body: { fileUrl: signedData.signedUrl, fileName: file.name, extractPositions: true },
          });
          if (fnError) throw fnError;
          deptRows = result?.departments || [];
          extractedPositions = result?.positions || [];
          if (!deptRows.length) throw new Error("Не удалось извлечь оргструктуру из документа");
        }
      } else if (ext === ".json") {
        const text = await file.text();
        const parsed = JSON.parse(text);
        deptRows = Array.isArray(parsed) ? parsed : parsed.departments || [];
        if (parsed.positions) extractedPositions = parsed.positions;
      } else if (ext === ".docx" || ext === ".doc" || ext === ".pdf") {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `orgstructure/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase.storage.from("hr-documents").upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: signedData, error: signError } = await supabase.storage.from("hr-documents").createSignedUrl(filePath, 600);
        if (signError || !signedData?.signedUrl) throw signError || new Error("Не удалось создать ссылку на файл");
        const { data: result, error: fnError } = await supabase.functions.invoke("parse-org-structure", {
          body: { fileUrl: signedData.signedUrl, fileName: file.name, extractPositions: true },
        });
        if (fnError) throw fnError;
        deptRows = result?.departments || [];
        extractedPositions = result?.positions || [];
        if (!deptRows.length) throw new Error("Не удалось извлечь оргструктуру из документа");
      } else {
        throw new Error("Поддерживаются CSV, XLSX, JSON, DOCX и PDF файлы");
      }

      const nameToId = new Map<string, string>();
      for (const dept of deptRows) {
        const { data, error } = await supabase.from("departments").insert({ name: dept.name, description: dept.description || null, company_id: profile?.company_id || null } as any).select("id").single();
        if (error) throw error;
        nameToId.set(dept.name, data.id);
      }
      for (const dept of deptRows) {
        if (dept.parent && nameToId.has(dept.parent) && nameToId.has(dept.name)) {
          await supabase.from("departments").update({ parent_id: nameToId.get(dept.parent) } as any).eq("id", nameToId.get(dept.name)!);
        }
      }

      let posCount = 0;
      if (extractedPositions.length > 0) {
        posCount = await createPositionsFromData(extractedPositions);
      }
      return { deptCount: deptRows.length, posCount };
    },
    onSuccess: ({ deptCount, posCount }) => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      toast.success(posCount > 0 ? `Загружено ${deptCount} отделов и ${posCount} должностей` : `Загружено ${deptCount} отделов`);
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: any) => { toast.error(e.message); setUploading(false); },
  });

  const generatePositionsMutation = useMutation({
    mutationFn: async () => {
      setGeneratingPositions(true);
      if (departments.length === 0) throw new Error("Сначала загрузите оргструктуру");
      const { data: result, error: fnError } = await supabase.functions.invoke("generate-positions-from-org", {
        body: { departments },
      });
      if (fnError) throw fnError;
      const positions = result?.positions || [];
      if (!positions.length) throw new Error("AI не смог сгенерировать должности");
      return await createPositionsFromData(positions);
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      toast.success(`Создано ${count} должностей с профилями компетенций`);
      setGeneratingPositions(false);
    },
    onError: (e: any) => { toast.error(e.message); setGeneratingPositions(false); },
  });

  const deleteDeptMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["departments"] }); toast.success("Отдел удалён"); },
    onError: (e: any) => toast.error(e.message),
  });

  const buildTree = (items: any[], parentId: string | null = null): any[] =>
    items.filter((d) => d.parent_id === parentId).map((d) => ({ ...d, children: buildTree(items, d.id) }));

  const tree = buildTree(departments);

  const renderTree = (nodes: any[], depth = 0) =>
    nodes.map((node) => (
      <div key={node.id}>
        <div className="flex items-center justify-between py-2 px-4 hover:bg-secondary/20 transition-colors"
          style={{ paddingLeft: `${16 + depth * 24}px` }}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{depth > 0 ? "└" : "■"}</span>
            <span className="text-sm font-medium text-foreground">{node.name}</span>
            {node.description && <span className="text-xs text-muted-foreground">— {node.description}</span>}
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteDeptMutation.mutate(node.id)}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
        {node.children?.length > 0 && renderTree(node.children, depth + 1)}
      </div>
    ));

  return (
    <div className="space-y-4">
      <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Загрузить оргструктуру из файла</p>
        <p className="text-xs text-muted-foreground">
          CSV/XLSX/JSON — извлечение отделов. DOCX/PDF — AI автоматически извлечёт отделы, должности, компетенции и психопортреты.
        </p>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,.json,.xlsx,.xls,.docx,.doc,.pdf"
            className="text-sm text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:bg-secondary file:text-foreground file:text-xs file:font-medium file:border-0 file:cursor-pointer" />
          <Button size="sm" onClick={() => uploadMutation.mutate()} disabled={uploading}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Загрузить
          </Button>
        </div>
      </div>

      {departments.length > 0 && (
        <div className="bg-primary/5 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">Генерация должностей из оргструктуры</p>
          <p className="text-xs text-muted-foreground">
            AI проанализирует структуру отделов и создаст типовые должности с профилями компетенций и психологическими портретами.
          </p>
          <Button size="sm" variant="outline" onClick={() => generatePositionsMutation.mutate()} disabled={generatingPositions}>
            {generatingPositions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Сгенерировать должности (AI)
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : departments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Оргструктура не загружена</p>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden divide-y divide-border/50">
          {renderTree(tree)}
        </div>
      )}
    </div>
  );
};

// ── Edge (Career Path) Editor Modal ──
const EdgeEditor = ({
  edge,
  positions,
  onClose,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  edge: { id: string; source: string; target: string; estimated_months: number | null; strategy_description: string | null };
  positions: Position[];
  onClose: () => void;
  onSave: (data: { from_position_id: string; to_position_id: string; estimated_months: number | null; strategy_description: string | null }) => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}) => {
  const [from, setFrom] = useState(edge.source);
  const [to, setTo] = useState(edge.target);
  const [months, setMonths] = useState<string>(edge.estimated_months?.toString() ?? "");
  const [strategy, setStrategy] = useState(edge.strategy_description ?? "");

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-primary" /> Карьерная связь
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">Из должности</label>
            <select value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20">
              {positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">В должность</label>
            <select value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20">
              {positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">Оценка длительности (месяцев)</label>
          <input type="number" min={0} value={months} onChange={(e) => setMonths(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
            placeholder="Например, 12" />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">Стратегия / описание перехода</label>
          <textarea value={strategy} onChange={(e) => setStrategy(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 min-h-[80px]"
            placeholder="Какие шаги/обучение нужны для перехода" />
        </div>

        <div className="flex justify-between gap-2 pt-2">
          <Button variant="ghost" className="text-destructive" onClick={onDelete} disabled={isDeleting || isSaving}>
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Удалить связь
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Отмена</Button>
            <Button
              onClick={() => {
                if (from === to) { toast.error("Нельзя создать связь должности самой с собой"); return; }
                onSave({
                  from_position_id: from,
                  to_position_id: to,
                  estimated_months: months ? Number(months) : null,
                  strategy_description: strategy || null,
                });
              }}
              disabled={isSaving || isDeleting}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Сохранить
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ──
const Positions = () => {
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const queryClient = useQueryClient();
  const [editingPosition, setEditingPosition] = useState<Position | null | "new">(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [hasUnsavedPaths, setHasUnsavedPaths] = useState(false);
  const [editingEdge, setEditingEdge] = useState<{ id: string; source: string; target: string; estimated_months: number | null; strategy_description: string | null } | null>(null);

  const { data: positions = [], isLoading: posLoading } = useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("*").order("created_at");
      if (error) throw error;
      return data as Position[];
    },
  });

  const { data: careerPaths = [], isLoading: pathsLoading } = useQuery({
    queryKey: ["career_paths"],
    queryFn: async () => {
      const { data, error } = await supabase.from("position_career_paths").select("*");
      if (error) throw error;
      return data as CareerPath[];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const [generating, setGenerating] = useState(false);

  const generatePathsMutation = useMutation({
    mutationFn: async () => {
      setGenerating(true);
      if (positions.length < 2) throw new Error("Нужно минимум 2 должности для построения путей");

      const { data: result, error: fnError } = await supabase.functions.invoke("generate-career-paths", {
        body: { positions, departments },
      });
      if (fnError) throw fnError;

      const paths = result?.career_paths || [];
      if (!paths.length) throw new Error("AI не смог построить карьерные пути");

      // Delete existing paths
      const { data: existing } = await supabase.from("position_career_paths").select("id");
      if (existing?.length) {
        for (const row of existing) {
          await supabase.from("position_career_paths").delete().eq("id", row.id);
        }
      }

      // Insert new paths
      const toInsert = paths.map((cp: any) => ({
        from_position_id: cp.from_position_id,
        to_position_id: cp.to_position_id,
        estimated_months: cp.estimated_months || null,
        strategy_description: cp.strategy_description || null,
        created_by: user!.id,
        company_id: profile?.company_id || null,
      }));
      const { error } = await supabase.from("position_career_paths").insert(toInsert as any);
      if (error) throw error;
      return paths.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["career_paths"] });
      setHasUnsavedPaths(false);
      toast.success(`Построено ${count} карьерных путей`);
      setGenerating(false);
    },
    onError: (e: any) => {
      toast.error(e.message);
      setGenerating(false);
    },
  });

  useMemo(() => {
    if (posLoading || pathsLoading) return;
    const cols = 3;
    setNodes(positions.map((p, i) => ({
      id: p.id,
      position: { x: (i % cols) * 280 + 50, y: Math.floor(i / cols) * 160 + 50 },
      data: {
        label: (
          <div className="text-center">
            <div className="font-semibold text-sm">{p.title}</div>
            {p.department && <div className="text-xs opacity-70">{p.department}</div>}
          </div>
        ),
      },
      style: {
        background: "hsl(var(--card))", border: "2px solid hsl(var(--primary))",
        borderRadius: "12px", padding: "12px 16px", color: "hsl(var(--card-foreground))", minWidth: "180px",
      },
    })));
    setEdges(careerPaths.map((cp) => ({
      id: cp.id, source: cp.from_position_id, target: cp.to_position_id,
      label: cp.estimated_months ? `~${cp.estimated_months} мес.` : undefined,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "hsl(var(--primary))" },
      labelStyle: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
    })));
  }, [positions, careerPaths, posLoading, pathsLoading]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "hsl(var(--primary))" }, id: `temp-${Date.now()}` }, eds));
    setHasUnsavedPaths(true);
  }, [setEdges]);

  const saveMutation = useMutation({
    mutationFn: async (pos: Partial<Position> & { id?: string }) => {
      if (pos.id) {
        const { error } = await supabase.from("positions").update(pos as any).eq("id", pos.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("positions").insert({ ...pos, created_by: user!.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      setEditingPosition(null);
      toast.success("Должность сохранена");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("positions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["career_paths"] });
      toast.success("Должность удалена");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const savePathsMutation = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase.from("position_career_paths").select("id");
      if (existing?.length) {
        for (const row of existing) {
          await supabase.from("position_career_paths").delete().eq("id", row.id);
        }
      }
      const pathsToInsert = edges.filter((e) => e.source && e.target).map((e) => {
        const orig = careerPaths.find((cp) => cp.id === e.id);
        return {
          from_position_id: e.source,
          to_position_id: e.target,
          estimated_months: orig?.estimated_months ?? null,
          strategy_description: orig?.strategy_description ?? null,
          created_by: user!.id,
          company_id: profile?.company_id || null,
        };
      });
      if (pathsToInsert.length > 0) {
        const { error } = await supabase.from("position_career_paths").insert(pathsToInsert as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career_paths"] });
      setHasUnsavedPaths(false);
      toast.success("Карьерные пути сохранены");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateEdgeMutation = useMutation({
    mutationFn: async (data: { id: string; from_position_id: string; to_position_id: string; estimated_months: number | null; strategy_description: string | null }) => {
      // If id starts with "temp-" — it's a new unsaved edge, insert it
      if (data.id.startsWith("temp-")) {
        const { error } = await supabase.from("position_career_paths").insert({
          from_position_id: data.from_position_id,
          to_position_id: data.to_position_id,
          estimated_months: data.estimated_months,
          strategy_description: data.strategy_description,
          created_by: user!.id,
          company_id: profile?.company_id || null,
        } as any);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("position_career_paths").update({
          from_position_id: data.from_position_id,
          to_position_id: data.to_position_id,
          estimated_months: data.estimated_months,
          strategy_description: data.strategy_description,
        } as any).eq("id", data.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career_paths"] });
      setEditingEdge(null);
      setHasUnsavedPaths(false);
      toast.success("Связь обновлена");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteEdgeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!id.startsWith("temp-")) {
        const { error } = await supabase.from("position_career_paths").delete().eq("id", id);
        if (error) throw error;
      }
      setEdges((eds) => eds.filter((e) => e.id !== id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career_paths"] });
      setEditingEdge(null);
      toast.success("Связь удалена");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onEdgeClick = useCallback((_: any, edge: Edge) => {
    const orig = careerPaths.find((cp) => cp.id === edge.id);
    setEditingEdge({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      estimated_months: orig?.estimated_months ?? null,
      strategy_description: orig?.strategy_description ?? null,
    });
  }, [careerPaths]);

  const onNodeDoubleClick = useCallback((_: any, node: Node) => {
    const pos = positions.find((p) => p.id === node.id);
    if (pos) setEditingPosition(pos);
  }, [positions]);

  if (posLoading || pathsLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Должности и оргструктура</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Управление должностями, эталонами компетенций и организационной структурой
        </p>
      </div>

      <Tabs defaultValue="positions">
        <TabsList>
          <TabsTrigger value="positions">Должности и карьерные пути</TabsTrigger>
          <TabsTrigger value="orgstructure">Оргструктура</TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="space-y-6 mt-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => generatePathsMutation.mutate()} disabled={generating || positions.length < 2}>
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Автопостроение путей (AI)
            </Button>
            <Button onClick={() => setEditingPosition("new")}>
              <Plus className="w-4 h-4" /> Добавить должность
            </Button>
          </div>

          {/* Graph */}
          <p className="text-xs text-muted-foreground -mb-2">
            Двойной клик по должности — редактирование. Клик по стрелке — изменить или удалить связь. Перетащите от точки одной должности к другой, чтобы создать новую связь.
          </p>
          <div className="bg-card rounded-xl border border-border react-flow-contrast-cursor" style={{ height: "500px" }}>
            <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange}
              onEdgesChange={(changes) => { onEdgesChange(changes); if (changes.some((c) => c.type === "remove")) setHasUnsavedPaths(true); }}
              onConnect={onConnect} onNodeDoubleClick={onNodeDoubleClick} onEdgeClick={onEdgeClick} fitView deleteKeyCode="Delete">
              <Background /><Controls />
              <MiniMap style={{ background: "hsl(var(--card))" }} maskColor="hsl(var(--muted) / 0.5)" />
              <Panel position="top-right">
                {hasUnsavedPaths && (
                  <Button size="sm" onClick={() => savePathsMutation.mutate()} disabled={savePathsMutation.isPending}>
                    <Save className="w-4 h-4" /> Сохранить связи
                  </Button>
                )}
              </Panel>
            </ReactFlow>
          </div>

          {/* Positions list */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Список должностей</h3>
            </div>
            <div className="divide-y divide-border">
              {positions.map((p) => {
                const compCount = Array.isArray(p.competency_profile) ? p.competency_profile.length : 0;
                const psychCount = Array.isArray(p.psychological_profile) ? p.psychological_profile.length :
                  (typeof p.psychological_profile === "object" && p.psychological_profile ? Object.keys(p.psychological_profile).length : 0);
                const statusLabel = p.profile_status === "approved" ? "Утверждён" : p.profile_status === "review" ? "На ревью" : p.profile_status === "archived" ? "Архив" : "Черновик";
                return (
                  <div key={p.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{p.title}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{p.department || "Без отдела"}</span>
                        <span>{statusLabel}</span>
                        {compCount > 0 && <span className="flex items-center gap-0.5"><Target className="w-3 h-3" />{compCount} компетенций</span>}
                        {psychCount > 0 && <span className="flex items-center gap-0.5"><Brain className="w-3 h-3" />{psychCount} черт</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setEditingPosition(p)}>Редактировать</Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(p.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {positions.length === 0 && <p className="p-8 text-center text-muted-foreground">Должности ещё не созданы</p>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="orgstructure" className="mt-4">
          <OrgStructureUpload />
        </TabsContent>
      </Tabs>

      {editingPosition && (
        <PositionEditor
          position={editingPosition === "new" ? null : editingPosition}
          onClose={() => setEditingPosition(null)}
          isSaving={saveMutation.isPending}
          onSave={(data) => {
            if (editingPosition !== "new" && editingPosition) {
              saveMutation.mutate({ ...data, id: editingPosition.id });
            } else {
              saveMutation.mutate(data);
            }
          }}
        />
      )}

      {editingEdge && (
        <EdgeEditor
          edge={editingEdge}
          positions={positions}
          onClose={() => setEditingEdge(null)}
          onSave={(data) => updateEdgeMutation.mutate({ id: editingEdge.id, ...data })}
          onDelete={() => deleteEdgeMutation.mutate(editingEdge.id)}
          isSaving={updateEdgeMutation.isPending}
          isDeleting={deleteEdgeMutation.isPending}
        />
      )}
    </div>
  );
};

export default Positions;
