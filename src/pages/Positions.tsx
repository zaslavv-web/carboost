import { useState, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { laravelStorage } from "@/integrations/laravel/storage";
import { aiInvoke } from "@/integrations/laravel/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import {
  ReactFlow, Background, Controls, addEdge,
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

interface OKRKPIItem {
  objective: string;
  metric: string;
  target: string;
  example: string;
}

// ── Structured Competency Editor ──
const CompetencyProfileEditor = ({
  value,
  onChange,
}: {
  value: CompetencyItem[];
  onChange: (v: CompetencyItem[]) => void;
}) => {
  const { t } = useTranslation("admin");
  const add = () => onChange([...value, { name: "", required_level: 5 }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const update = (i: number, field: keyof CompetencyItem, val: any) =>
    onChange(value.map((item, idx) => (idx === i ? { ...item, [field]: val } : item)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Target className="w-4 h-4 text-primary" /> {t("positions.compProfileLabel")}
        </label>
        <Button variant="ghost" size="sm" onClick={add} type="button">
          <Plus className="w-3 h-3" /> {t("positions.addComp")}
        </Button>
      </div>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">{t("positions.noComps")}</p>
      )}
      {value.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={item.name}
            onChange={(e) => update(i, "name", e.target.value)}
            placeholder={t("positions.compNamePlaceholder")}
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
  const { t } = useTranslation("admin");
  const levels = PSYCH_LEVEL_KEYS;
  const add = () => onChange([...value, { trait: "", level: "average" }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const update = (i: number, field: keyof PsychItem, val: string) =>
    onChange(value.map((item, idx) => (idx === i ? { ...item, [field]: val } : item)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Brain className="w-4 h-4 text-primary" /> {t("positions.psychLabel")}
        </label>
        <Button variant="ghost" size="sm" onClick={add} type="button">
          <Plus className="w-3 h-3" /> {t("positions.addComp")}
        </Button>
      </div>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">{t("positions.noTraits")}</p>
      )}
      {value.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={item.trait}
            onChange={(e) => update(i, "trait", e.target.value)}
            placeholder={t("positions.traitPlaceholder")}
            className="flex-1 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <select
            value={item.level}
            onChange={(e) => update(i, "level", e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          >
            {levels.map((l) => (
              <option key={l} value={l}>{t(`positions.psychLevels.${l}`)}</option>
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

const createEmptyOKR = (): OKRKPIItem => ({ objective: "", metric: "", target: "", example: "" });

const normalizeOKRKPI = (raw: any): OKRKPIItem[] => {
  const items = Array.isArray(raw) ? raw.slice(0, 5) : [];
  const normalized = items.map((item: any) => ({
    objective: String(item?.objective || ""),
    metric: String(item?.metric || ""),
    target: String(item?.target || ""),
    example: String(item?.example || ""),
  }));
  while (normalized.length < 3) normalized.push(createEmptyOKR());
  return normalized;
};

const OKRKPIEditor = ({ value, onChange }: { value: OKRKPIItem[]; onChange: (v: OKRKPIItem[]) => void }) => {
  const { t } = useTranslation("admin");
  const update = (i: number, field: keyof OKRKPIItem, val: string) =>
    onChange(value.map((item, idx) => (idx === i ? { ...item, [field]: val } : item)));
  const add = () => value.length < 5 && onChange([...value, createEmptyOKR()]);
  const remove = (i: number) => value.length > 3 && onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <Target className="w-4 h-4 text-primary" /> {t("positions.okrKpiTitle")}
          </label>
          <p className="text-xs text-muted-foreground mt-1">{t("positions.okrKpiHint")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={add} disabled={value.length >= 5} type="button">
          <Plus className="w-3 h-3" /> OKR/KPI
        </Button>
      </div>

      {value.map((item, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">OKR/KPI {i + 1}</span>
            {value.length > 3 && (
              <Button variant="ghost" size="icon" onClick={() => remove(i)} className="text-destructive h-7 w-7" type="button">
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input value={item.objective} onChange={(e) => update(i, "objective", e.target.value)} placeholder={t("positions.okrObjectivePlaceholder")} className="px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20" />
            <input value={item.metric} onChange={(e) => update(i, "metric", e.target.value)} placeholder={t("positions.okrMetricPlaceholder")} className="px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20" />
            <input value={item.target} onChange={(e) => update(i, "target", e.target.value)} placeholder={t("positions.okrTargetPlaceholder")} className="px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20" />
            <input value={item.example} onChange={(e) => update(i, "example", e.target.value)} placeholder={t("positions.okrExamplePlaceholder")} className="px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20" />
          </div>
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
  const { t } = useTranslation("admin");
  const [title, setTitle] = useState(position?.title || "");
  const [description, setDescription] = useState(position?.description || "");
  const [department, setDepartment] = useState(position?.department || "");
  const [profileStatus, setProfileStatus] = useState(position?.profile_status || "draft");
  const [profileTemplate, setProfileTemplate] = useState<any>(position?.profile_template || {});
  const [okrKpis, setOkrKpis] = useState<OKRKPIItem[]>(normalizeOKRKPI(position?.profile_template?.okr_kpis));
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
    setOkrKpis(normalizeOKRKPI(template.okr_kpis));
    toast.success(t("positions.toastTemplateApplied"));
  };

  // Load competencies from HR documents uploaded by HRD (matched by department/title)
  const loadFromHrDocuments = async () => {
    setLoadingFromDocs(true);
    try {
      const { data: docs, error } = await laravelDb
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
          if (p?.trait) collectedPsych.set(p.trait, normalizePsychLevel(p.level));
        });
      });

      if (collected.size === 0) {
        toast.error(t("positions.toastNoCompetenciesInDocs"));
        return;
      }

      const newComps: CompetencyItem[] = Array.from(collected.entries()).map(([name, required_level]) => ({
        name,
        required_level: required_level > 0 ? required_level : 5,
      }));
      const newPsych: PsychItem[] = Array.from(collectedPsych.entries()).map(([trait, level]) => ({ trait, level }));

      setCompetencies(newComps);
      if (newPsych.length > 0) setPsychTraits(newPsych);
      toast.success(t("positions.toastLoadedFromDocs", { count: newComps.length }));
    } catch (e: any) {
      toast.error(e.message || t("positions.toastLoadFromDocsError"));
    } finally {
      setLoadingFromDocs(false);
    }
  };

  const handleFileUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (![".doc", ".docx", ".pdf", ".csv", ".json", ".xlsx", ".xls"].includes(ext)) {
      toast.error(t("positions.toastUnsupportedFormat"));
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
        toast.success(t("positions.toastLoadedFromJson"));
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
          toast.success(t("positions.toastLoadedFromCsv", { count: items.length }));
        } else {
          toast.error(t("positions.toastCsvMissingColumn"));
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
          toast.success(t("positions.toastLoadedFromXlsx", { count: items.length }));
        } else {
          toast.error(t("positions.toastXlsxMissingColumn"));
        }
      } else {
        // For doc/docx/pdf — upload and parse with AI
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `standards/${Date.now()}_${safeName}`;
        const { error: uploadError } = await laravelStorage.from("hr-documents").upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: signedData, error: signError } = await laravelStorage.from("hr-documents").createSignedUrl(filePath, 600);
        if (signError || !signedData?.signedUrl) throw signError || new Error(t("positions.toastSignedUrlError"));

        const { data: result, error: fnError } = await aiInvoke("parse-position-standards", {
          body: { fileUrl: signedData.signedUrl, fileName: file.name },
        });
        if (fnError) throw fnError;

        if (result?.competencies?.length) {
          setCompetencies(result.competencies);
        }
        if (result?.psychological_profile?.length) {
          setPsychTraits(result.psychological_profile);
        }
        toast.success(t("positions.toastExtractedFromDoc"));
      }
    } catch (e: any) {
      toast.error(e.message || t("positions.toastFileProcessError"));
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
            {position ? t("positions.editorEditTitle") : t("positions.editorNewTitle")}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        {/* Basic info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">{t("positions.labelTitle")}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              placeholder={t("positions.titlePlaceholder")} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">{t("positions.labelDept")}</label>
            <input value={department} onChange={(e) => setDepartment(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">{t("positions.labelDesc")}</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 min-h-[50px]" />
        </div>

        <div className="bg-primary/5 rounded-lg border border-primary/20 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">{t("positions.eightBlocksTitle")}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {eightBlockJobProfileGuide.rules[0]} {eightBlockJobProfileGuide.rules[2]}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" type="button" onClick={() => setProfileTemplate({ ...profileTemplate, methodology: eightBlockJobProfileGuide.rules, blocks: eightBlockJobProfileGuide.blocks, generation_source: "manual", review_frequency: t("positions.reviewFreqDefault") })}>
              {t("positions.apply8Blocks")}
            </Button>
            {miningPilotProfiles.map((template, idx) => {
              const labelKey = idx === 0 ? "positions.templateMiningShiftLead" : "positions.templateMiningDigitalEngineer";
              return (
                <Button key={template.title} size="sm" variant="secondary" type="button" onClick={() => applyTemplate(template)}>
                  {t(labelKey)}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">{t("positions.labelProfileStatus")}</label>
            <select value={profileStatus} onChange={(e) => setProfileStatus(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20">
              <option value="draft">{t("positions.statusDraft")}</option>
              <option value="review">{t("positions.statusReview")}</option>
              <option value="approved">{t("positions.statusApproved")}</option>
              <option value="archived">{t("positions.statusArchived")}</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">{t("positions.labelSuccessMetrics")}</label>
            <input value={profileTemplate.success_metrics || ""} onChange={(e) => setProfileTemplate({ ...profileTemplate, success_metrics: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              placeholder={t("positions.successMetricsPlaceholder")} />
          </div>
        </div>

        <OKRKPIEditor value={okrKpis} onChange={setOkrKpis} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">{t("positions.labelGenSource")}</label>
            <select value={profileTemplate.generation_source || "manual"} onChange={(e) => setProfileTemplate({ ...profileTemplate, generation_source: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20">
              <option value="manual">{t("positions.genManual")}</option>
              <option value="vacancy">{t("positions.genVacancy")}</option>
              <option value="market">{t("positions.genMarket")}</option>
              <option value="psychological">{t("positions.genPsych")}</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">{t("positions.labelGrade")}</label>
            <input value={profileTemplate.grade || ""} onChange={(e) => setProfileTemplate({ ...profileTemplate, grade: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">{t("positions.labelReviewFreq")}</label>
            <input value={profileTemplate.review_frequency || ""} onChange={(e) => setProfileTemplate({ ...profileTemplate, review_frequency: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              placeholder={t("positions.reviewFreqPlaceholder")} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">{t("positions.labelResponsibilities")}</label>
            <textarea value={profileTemplate.responsibilities || ""} onChange={(e) => setProfileTemplate({ ...profileTemplate, responsibilities: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 min-h-[70px]" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">{t("positions.labelRequirementsRisks")}</label>
            <textarea value={profileTemplate.requirements_and_risks || ""} onChange={(e) => setProfileTemplate({ ...profileTemplate, requirements_and_risks: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 min-h-[70px]" />
          </div>
        </div>

        {/* File upload for standards */}
        <div className="bg-secondary/30 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <FileUp className="w-4 h-4 text-primary" /> {t("positions.uploadStandardLabel")}
          </p>
           <p className="text-xs text-muted-foreground">
             {t("positions.uploadStandardHint")}
           </p>
           <div className="flex flex-wrap items-center gap-3">
             <input ref={fileRef} type="file" accept=".doc,.docx,.pdf,.csv,.json,.xlsx,.xls"
               className="text-sm text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:bg-secondary file:text-foreground file:text-xs file:font-medium file:border-0 file:cursor-pointer" />
            <Button size="sm" onClick={handleFileUpload} disabled={parsing}>
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {t("positions.recognizeBtn")}
            </Button>
            <Button size="sm" variant="outline" onClick={loadFromHrDocuments} disabled={loadingFromDocs} type="button">
              {loadingFromDocs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {t("positions.pullFromHrDocs")}
            </Button>
          </div>
        </div>

        {/* Competency editor */}
        <CompetencyProfileEditor value={competencies} onChange={setCompetencies} />

        {/* Psych profile editor */}
        <PsychProfileEditor value={psychTraits} onChange={setPsychTraits} />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t("positions.cancelBtn")}</Button>
          <Button
            onClick={() => {
              if (competencies.length === 0) {
                toast.error(t("positions.toastNeedAtLeastOneComp"));
                return;
              }
              const invalid = competencies.filter((c) => !c.name.trim() || !c.required_level || c.required_level <= 0);
              if (invalid.length > 0) {
                toast.error(t("positions.toastCompNeedsNameAndLevel"));
                return;
              }
              const filledOkrKpis = okrKpis.filter((item) =>
                item.objective.trim() || item.metric.trim() || item.target.trim() || item.example.trim()
              );
              if (filledOkrKpis.length < 3 || filledOkrKpis.length > 5) {
                toast.error(t("positions.toastOkrCountError"));
                return;
              }
              const invalidOkrKpis = filledOkrKpis.filter((item) =>
                !item.objective.trim() || !item.metric.trim() || !item.target.trim() || !item.example.trim()
              );
              if (invalidOkrKpis.length > 0) {
                toast.error(t("positions.toastOkrFieldsRequired"));
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
                  okr_kpis: filledOkrKpis,
                  competencies,
                  psychological_profile: psychObj,
                  career_growth: profileTemplate.career_growth || "",
                },
              });
            }}
            disabled={!title || isSaving}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t("positions.saveBtn")}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ── Org Structure Upload ──
const OrgStructureUpload = () => {
  const { t } = useTranslation("admin");
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [generatingPositions, setGeneratingPositions] = useState(false);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await laravelDb.from("departments").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const createPositionsFromData = async (positions: any[]) => {
    let created = 0;
    for (const pos of positions) {
      const { error } = await laravelDb.from("positions").insert({
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
      if (!file) throw new Error(t("positions.toastSelectFile"));
      if (!profile?.company_id) throw new Error(t("positions.toastNoCompanyProfile"));
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
        if (nameIdx < 0) throw new Error(t("positions.toastCsvNeedsDeptColumn"));
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
          const { error: uploadError } = await laravelStorage.from("hr-documents").upload(filePath, file);
          if (uploadError) throw uploadError;
          const { data: signedData, error: signError } = await laravelStorage.from("hr-documents").createSignedUrl(filePath, 600);
          if (signError || !signedData?.signedUrl) throw signError || new Error(t("positions.toastSignedUrlError"));
          const { data: result, error: fnError } = await aiInvoke("parse-org-structure", {
            body: { fileUrl: signedData.signedUrl, fileName: file.name, extractPositions: true },
          });
          if (fnError) throw fnError;
          deptRows = result?.departments || [];
          extractedPositions = result?.positions || [];
          if (!deptRows.length) throw new Error(t("positions.toastFailedExtractOrg"));
        }
      } else if (ext === ".json") {
        const text = await file.text();
        const parsed = JSON.parse(text);
        deptRows = Array.isArray(parsed) ? parsed : parsed.departments || [];
        if (parsed.positions) extractedPositions = parsed.positions;
      } else if (ext === ".docx" || ext === ".doc" || ext === ".pdf") {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `orgstructure/${Date.now()}_${safeName}`;
        const { error: uploadError } = await laravelStorage.from("hr-documents").upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: signedData, error: signError } = await laravelStorage.from("hr-documents").createSignedUrl(filePath, 600);
        if (signError || !signedData?.signedUrl) throw signError || new Error(t("positions.toastSignedUrlError"));
        const { data: result, error: fnError } = await aiInvoke("parse-org-structure", {
          body: { fileUrl: signedData.signedUrl, fileName: file.name, extractPositions: true },
        });
        if (fnError) throw fnError;
        deptRows = result?.departments || [];
        extractedPositions = result?.positions || [];
        if (!deptRows.length) throw new Error(t("positions.toastFailedExtractOrg"));
      } else {
        throw new Error(t("positions.toastSupportedOrgFormats"));
      }

      const nameToId = new Map<string, string>();
      for (const dept of deptRows) {
        const { data, error } = await laravelDb.from("departments").insert({ name: dept.name, description: dept.description || null, company_id: profile?.company_id || null } as any).select("id").single();
        if (error) throw error;
        nameToId.set(dept.name, data.id);
      }
      for (const dept of deptRows) {
        if (dept.parent && nameToId.has(dept.parent) && nameToId.has(dept.name)) {
          await laravelDb.from("departments").update({ parent_id: nameToId.get(dept.parent) } as any).eq("id", nameToId.get(dept.name)!);
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
      toast.success(posCount > 0 ? t("positions.toastLoadedDeptsAndPositions", { deptCount, posCount }) : t("positions.toastLoadedDepts", { deptCount }));
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: any) => { toast.error(e.message); setUploading(false); },
  });

  const generatePositionsMutation = useMutation({
    mutationFn: async () => {
      setGeneratingPositions(true);
      if (departments.length === 0) throw new Error(t("positions.toastLoadOrgFirst"));
      const { data: result, error: fnError } = await aiInvoke("generate-positions-from-org", {
        body: { departments },
      });
      if (fnError) throw fnError;
      const positions = result?.positions || [];
      if (!positions.length) throw new Error(t("positions.toastAiNoPositions"));
      return await createPositionsFromData(positions);
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      toast.success(t("positions.toastCreatedPositions", { count }));
      setGeneratingPositions(false);
    },
    onError: (e: any) => { toast.error(e.message); setGeneratingPositions(false); },
  });

  const deleteDeptMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["departments"] }); toast.success(t("positions.toastDeptDeleted")); },
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
        <p className="text-sm font-medium text-foreground">{t("positions.orgUploadLabel")}</p>
        <p className="text-xs text-muted-foreground">
          {t("positions.orgUploadHint")}
        </p>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,.json,.xlsx,.xls,.docx,.doc,.pdf"
            className="text-sm text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:bg-secondary file:text-foreground file:text-xs file:font-medium file:border-0 file:cursor-pointer" />
          <Button size="sm" onClick={() => uploadMutation.mutate()} disabled={uploading}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {t("positions.uploadBtn")}
          </Button>
        </div>
      </div>

      {departments.length > 0 && (
        <div className="bg-primary/5 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">{t("positions.genPositionsLabel")}</p>
          <p className="text-xs text-muted-foreground">
            {t("positions.genPositionsHint")}
          </p>
          <Button size="sm" variant="outline" onClick={() => generatePositionsMutation.mutate()} disabled={generatingPositions}>
            {generatingPositions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {t("positions.genPositionsBtn")}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : departments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{t("positions.orgEmpty")}</p>
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
  const { t } = useTranslation("admin");
  const [from, setFrom] = useState(edge.source);
  const [to, setTo] = useState(edge.target);
  const [months, setMonths] = useState<string>(edge.estimated_months?.toString() ?? "");
  const [strategy, setStrategy] = useState(edge.strategy_description ?? "");

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-primary" /> {t("positions.edgeTitle")}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">{t("positions.edgeFromLabel")}</label>
            <select value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20">
              {positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">{t("positions.edgeToLabel")}</label>
            <select value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20">
              {positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">{t("positions.edgeMonthsLabel")}</label>
          <input type="number" min={0} value={months} onChange={(e) => setMonths(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
            placeholder={t("positions.edgeMonthsPlaceholder")} />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">{t("positions.edgeStrategyLabel")}</label>
          <textarea value={strategy} onChange={(e) => setStrategy(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 min-h-[80px]"
            placeholder={t("positions.edgeStrategyPlaceholder")} />
        </div>

        <div className="flex justify-between gap-2 pt-2">
          <Button variant="ghost" className="text-destructive" onClick={onDelete} disabled={isDeleting || isSaving}>
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {t("positions.deleteEdge")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t("positions.cancelBtn")}</Button>
            <Button
              onClick={() => {
                if (from === to) { toast.error(t("positions.toastSelfLink")); return; }
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
              {t("positions.saveBtn")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ──
const Positions = () => {
  const { t } = useTranslation("admin");
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
      const { data, error } = await laravelDb.from("positions").select("*").order("created_at");
      if (error) throw error;
      return data as Position[];
    },
  });

  const { data: careerPaths = [], isLoading: pathsLoading } = useQuery({
    queryKey: ["career_paths"],
    queryFn: async () => {
      const { data, error } = await laravelDb.from("position_career_paths").select("*");
      if (error) throw error;
      return data as CareerPath[];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await laravelDb.from("departments").select("*").order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const [generating, setGenerating] = useState(false);

  const generatePathsMutation = useMutation({
    mutationFn: async () => {
      setGenerating(true);
      if (positions.length < 2) throw new Error(t("positions.toastNeedTwoPositions"));

      const { data: result, error: fnError } = await aiInvoke("generate-career-paths", {
        body: { positions, departments },
      });
      if (fnError) throw fnError;

      const paths = result?.career_paths || [];
      if (!paths.length) throw new Error(t("positions.toastAiNoCareerPaths"));

      // Delete existing paths
      const { data: existing } = await laravelDb.from("position_career_paths").select("id");
      if (existing?.length) {
        for (const row of existing) {
          await laravelDb.from("position_career_paths").delete().eq("id", row.id);
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
      const { error } = await laravelDb.from("position_career_paths").insert(toInsert as any);
      if (error) throw error;
      return paths.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["career_paths"] });
      setHasUnsavedPaths(false);
      toast.success(t("positions.toastBuiltPaths", { count }));
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
      label: cp.estimated_months ? t("positions.monthsLabel", { n: cp.estimated_months }) : undefined,
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
        const { error } = await laravelDb.from("positions").update(pos as any).eq("id", pos.id);
        if (error) throw error;
      } else {
        const { error } = await laravelDb.from("positions").insert({ ...pos, created_by: user!.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      setEditingPosition(null);
      toast.success(t("positions.toastPositionSaved"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("positions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["career_paths"] });
      toast.success(t("positions.toastPositionDeleted"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const savePathsMutation = useMutation({
    mutationFn: async () => {
      const { data: existing } = await laravelDb.from("position_career_paths").select("id");
      if (existing?.length) {
        for (const row of existing) {
          await laravelDb.from("position_career_paths").delete().eq("id", row.id);
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
        const { error } = await laravelDb.from("position_career_paths").insert(pathsToInsert as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career_paths"] });
      setHasUnsavedPaths(false);
      toast.success(t("positions.toastPathsSaved"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateEdgeMutation = useMutation({
    mutationFn: async (data: { id: string; from_position_id: string; to_position_id: string; estimated_months: number | null; strategy_description: string | null }) => {
      // If id starts with "temp-" — it's a new unsaved edge, insert it
      if (data.id.startsWith("temp-")) {
        const { error } = await laravelDb.from("position_career_paths").insert({
          from_position_id: data.from_position_id,
          to_position_id: data.to_position_id,
          estimated_months: data.estimated_months,
          strategy_description: data.strategy_description,
          created_by: user!.id,
          company_id: profile?.company_id || null,
        } as any);
        if (error) throw error;
      } else {
        const { error } = await laravelDb.from("position_career_paths").update({
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
      toast.success(t("positions.toastEdgeUpdated"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteEdgeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!id.startsWith("temp-")) {
        const { error } = await laravelDb.from("position_career_paths").delete().eq("id", id);
        if (error) throw error;
      }
      setEdges((eds) => eds.filter((e) => e.id !== id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career_paths"] });
      setEditingEdge(null);
      toast.success(t("positions.toastEdgeDeleted"));
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
        <h1 className="text-2xl font-bold text-foreground">{t("positions.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("positions.subtitle")}
        </p>
      </div>

      <Tabs defaultValue="positions">
        <TabsList>
          <TabsTrigger value="positions">{t("positions.tabPositions")}</TabsTrigger>
          <TabsTrigger value="orgstructure">{t("positions.tabOrgStructure")}</TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="space-y-6 mt-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => generatePathsMutation.mutate()} disabled={generating || positions.length < 2}>
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {t("positions.autoPathsBtn")}
            </Button>
            <Button onClick={() => setEditingPosition("new")}>
              <Plus className="w-4 h-4" /> {t("positions.addPositionBtn")}
            </Button>
          </div>

          {/* Graph */}
          <p className="text-xs text-muted-foreground -mb-2">
{t("positions.graphHint")}
          </p>
          <div className="bg-card rounded-xl border border-border react-flow-contrast-cursor" style={{ height: "500px" }}>
            <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange}
              onEdgesChange={(changes) => { onEdgesChange(changes); if (changes.some((c) => c.type === "remove")) setHasUnsavedPaths(true); }}
              onConnect={onConnect} onNodeDoubleClick={onNodeDoubleClick} onEdgeClick={onEdgeClick} fitView deleteKeyCode="Delete">
              <Background /><Controls />
              <Panel position="top-right">
                {hasUnsavedPaths && (
                  <Button size="sm" onClick={() => savePathsMutation.mutate()} disabled={savePathsMutation.isPending}>
                    <Save className="w-4 h-4" /> {t("positions.savePathsBtn")}
                  </Button>
                )}
              </Panel>
            </ReactFlow>
          </div>

          {/* Positions list */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">{t("positions.listTitle")}</h3>
            </div>
            <div className="divide-y divide-border">
              {positions.map((p) => {
                const compCount = Array.isArray(p.competency_profile) ? p.competency_profile.length : 0;
                const psychCount = Array.isArray(p.psychological_profile) ? p.psychological_profile.length :
                  (typeof p.psychological_profile === "object" && p.psychological_profile ? Object.keys(p.psychological_profile).length : 0);
                const statusLabel = p.profile_status === "approved" ? t("positions.statusApproved") : p.profile_status === "review" ? t("positions.statusReview") : p.profile_status === "archived" ? t("positions.statusArchived") : t("positions.statusDraft");
                return (
                  <div key={p.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{p.title}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{p.department || t("positions.noDept")}</span>
                        <span>{statusLabel}</span>
                        {compCount > 0 && <span className="flex items-center gap-0.5"><Target className="w-3 h-3" />{t("positions.competencies", { count: compCount })}</span>}
                        {psychCount > 0 && <span className="flex items-center gap-0.5"><Brain className="w-3 h-3" />{t("positions.traits", { count: psychCount })}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setEditingPosition(p)}>{t("positions.editBtn")}</Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(p.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {positions.length === 0 && <p className="p-8 text-center text-muted-foreground">{t("positions.emptyPositions")}</p>}
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
