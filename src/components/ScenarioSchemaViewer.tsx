import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  MarkerType,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { X, Copy, Network, Braces } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ScenarioSchemaViewerProps {
  scenario: any;
  onClose: () => void;
}

/** Человекочитаемые подписи для частых ключей структуры сценария. */
const LABELS_RU: Record<string, string> = {
  brief: "Бриф",
  summary: "Резюме",
  description: "Описание",
  title: "Название",
  goal: "Цель",
  purpose: "Цель",
  context: "Контекст",
  steps: "Шаги сценария",
  stages: "Этапы",
  tasks: "Задания",
  questions: "Вопросы оценки",
  criteria: "Критерии оценки",
  competencies: "Компетенции",
  skills: "Навыки",
  key_points: "Ключевые пункты",
  keyPoints: "Ключевые пункты",
  indicators: "Индикаторы",
  levels: "Уровни",
  scale: "Шкала",
  max_score: "Макс. балл",
  duration: "Длительность",
  roles: "Роли",
  audience: "Аудитория",
  materials: "Материалы",
  outcomes: "Результаты",
  notes: "Заметки",
};

const LABELS_EN: Record<string, string> = {
  brief: "Brief",
  summary: "Summary",
  description: "Description",
  title: "Title",
  goal: "Goal",
  purpose: "Purpose",
  context: "Context",
  steps: "Scenario steps",
  stages: "Stages",
  tasks: "Tasks",
  questions: "Assessment questions",
  criteria: "Criteria",
  competencies: "Competencies",
  skills: "Skills",
  key_points: "Key points",
  keyPoints: "Key points",
  indicators: "Indicators",
  levels: "Levels",
  scale: "Scale",
  max_score: "Max score",
  duration: "Duration",
  roles: "Roles",
  audience: "Audience",
  materials: "Materials",
  outcomes: "Outcomes",
  notes: "Notes",
};

const humanize = (key: string, lang: string) => {
  const dict = lang.startsWith("ru") ? LABELS_RU : LABELS_EN;
  if (dict[key]) return dict[key];
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
};

const isPrimitive = (v: any) =>
  v === null || ["string", "number", "boolean"].includes(typeof v);

/** Короткое имя элемента массива объектов. */
const itemTitle = (item: any, index: number) => {
  if (isPrimitive(item)) return String(item);
  return (
    item?.title ||
    item?.name ||
    item?.question ||
    item?.label ||
    item?.step ||
    item?.text ||
    `#${index + 1}`
  );
};

const NODE_W = 260;
const COL_GAP = 300;
const ROW_GAP = 150;

const ScenarioSchemaViewer = ({ scenario, onClose }: ScenarioSchemaViewerProps) => {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<"schema" | "json">("schema");
  const lang = i18n.language || "ru";

  /** scenario_data может прийти строкой — пробуем распарсить. */
  const data = useMemo(() => {
    const raw = scenario?.scenario_data;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  }, [scenario]);

  const { nodes, edges, isEmpty } = useMemo(() => {
    const n: Node[] = [];
    const e: Edge[] = [];
    const rowsPerLevel: Record<number, number> = {};
    let idSeq = 0;

    const place = (level: number) => {
      const row = rowsPerLevel[level] ?? 0;
      rowsPerLevel[level] = row + 1;
      return { x: level * COL_GAP, y: row * ROW_GAP };
    };

    const baseStyle = {
      background: "hsl(var(--card))",
      color: "hsl(var(--card-foreground))",
      borderRadius: "12px",
      padding: "10px 14px",
      border: "1px solid hsl(var(--border))",
      minWidth: `${NODE_W}px`,
      maxWidth: `${NODE_W}px`,
    } as const;

    const addNode = (level: number, label: JSX.Element, style?: Record<string, any>) => {
      const id = `n-${idSeq++}`;
      n.push({
        id,
        position: place(level),
        data: { label },
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        style: { ...baseStyle, ...(style || {}) },
      });
      return id;
    };

    const connect = (from: string, to: string, dashed = false) => {
      e.push({
        id: `${from}->${to}`,
        source: from,
        target: to,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: dashed ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))",
          ...(dashed ? { strokeDasharray: "5 5" } : {}),
        },
      });
    };

    // Корневой узел
    const rootTitle =
      (!isPrimitive(data) && !Array.isArray(data) && (data?.title || data?.scenario?.title)) ||
      scenario.title;
    const rootDescription =
      (!isPrimitive(data) && !Array.isArray(data) && (data?.description || data?.scenario?.description)) ||
      scenario.description;

    const rootId = addNode(
      0,
      <div className="text-center">
        <div className="font-bold text-sm">{rootTitle}</div>
        {rootDescription && (
          <div className="text-[10px] mt-1 opacity-80 line-clamp-3">{rootDescription}</div>
        )}
      </div>,
      {
        background: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
        border: "none",
        borderRadius: "16px",
        padding: "14px 18px",
        boxShadow: "0 4px 20px hsl(var(--primary) / 0.25)",
      },
    );

    let produced = 0;

    /** Рекурсивный обход произвольной структуры. */
    const walk = (value: any, parentId: string, level: number, depth: number) => {
      if (value === null || value === undefined) return;
      if (depth > 3) return;

      // Массив
      if (Array.isArray(value)) {
        if (value.length === 0) return;
        const allPrimitive = value.every(isPrimitive);
        if (allPrimitive) {
          // отображается родителем как список — сюда не попадаем
          return;
        }
        value.slice(0, 12).forEach((item, i) => {
          const fields = isPrimitive(item) ? {} : (item as Record<string, any>);
          const primEntries = Object.entries(fields).filter(
            ([k, v]) => isPrimitive(v) && !["title", "name", "question", "label"].includes(k),
          );
          const id = addNode(
            level,
            <div className="text-left">
              <div className="text-[10px] opacity-50 mb-0.5">#{i + 1}</div>
              <div className="text-[11px] font-medium line-clamp-3">{itemTitle(item, i)}</div>
              {primEntries.slice(0, 3).map(([k, v]) => (
                <div key={k} className="text-[9px] opacity-70 line-clamp-1 mt-0.5">
                  <span className="font-medium">{humanize(k, lang)}:</span> {String(v)}
                </div>
              ))}
            </div>,
          );
          produced++;
          connect(parentId, id);
          // вложенные массивы/объекты внутри элемента
          if (!isPrimitive(item)) {
            Object.entries(fields).forEach(([k, v]) => {
              if (isPrimitive(v)) return;
              renderKey(k, v, id, level + 1, depth + 1);
            });
          }
        });
        if (value.length > 12) {
          const id = addNode(
            level,
            <div className="text-[10px] opacity-70">{t("scenarioViewer.more", { count: value.length - 12 })}</div>,
          );
          produced++;
          connect(parentId, id, true);
        }
        return;
      }

      // Объект
      if (typeof value === "object") {
        Object.entries(value).forEach(([k, v]) => renderKey(k, v, parentId, level, depth));
      }
    };

    /** Рисует одну пару ключ→значение. */
    const renderKey = (key: string, value: any, parentId: string, level: number, depth: number) => {
      if (value === null || value === undefined || value === "") return;
      if (depth > 3) return;

      // Пропускаем поля, уже показанные в корне
      if (parentId === rootId && ["title", "description"].includes(key)) return;

      const label = humanize(key, lang);

      if (isPrimitive(value)) {
        const id = addNode(
          level,
          <div className="text-left">
            <div className="font-semibold text-[11px] mb-0.5">{label}</div>
            <div className="text-[10px] opacity-80 whitespace-pre-wrap line-clamp-5">{String(value)}</div>
          </div>,
          { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" },
        );
        produced++;
        connect(parentId, id);
        return;
      }

      if (Array.isArray(value)) {
        if (value.length === 0) return;
        if (value.every(isPrimitive)) {
          const id = addNode(
            level,
            <div className="text-left">
              <div className="font-semibold text-[11px] mb-1">{label}</div>
              <div className="flex flex-wrap gap-1">
                {value.slice(0, 12).map((c, i) => (
                  <span
                    key={i}
                    className="text-[9px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
                  >
                    {String(c)}
                  </span>
                ))}
                {value.length > 12 && (
                  <span className="text-[9px] opacity-70">
                    {t("scenarioViewer.more", { count: value.length - 12 })}
                  </span>
                )}
              </div>
            </div>,
            { border: "2px dashed hsl(var(--primary) / 0.4)" },
          );
          produced++;
          connect(parentId, id);
          return;
        }
        // массив объектов — хаб + элементы
        const hubId = addNode(
          level,
          <div className="text-center">
            <div className="font-semibold text-[11px]">{label}</div>
            <div className="text-[10px] opacity-70">
              {t("scenarioViewer.itemsCount", { count: value.length })}
            </div>
          </div>,
          { border: "2px solid hsl(var(--primary))", minWidth: "180px", maxWidth: "220px" },
        );
        produced++;
        connect(parentId, hubId);
        walk(value, hubId, level + 1, depth + 1);
        return;
      }

      // вложенный объект
      const keys = Object.keys(value);
      if (keys.length === 0) return;
      const groupId = addNode(
        level,
        <div className="text-center">
          <div className="font-semibold text-[11px]">{label}</div>
          <div className="text-[10px] opacity-70">
            {t("scenarioViewer.fieldsCount", { count: keys.length })}
          </div>
        </div>,
        { border: "2px solid hsl(var(--primary) / 0.6)", minWidth: "180px", maxWidth: "220px" },
      );
      produced++;
      connect(parentId, groupId);
      if (depth + 1 > 3) return;
      walk(value, groupId, level + 1, depth + 1);
    };

    if (Array.isArray(data)) {
      renderKey("records", data, rootId, 1, 1);
    } else if (data && typeof data === "object") {
      // Разворачиваем обёртку { scenario: {...} }
      const root = data.scenario && typeof data.scenario === "object" ? { ...data.scenario, ...Object.fromEntries(Object.entries(data).filter(([k]) => k !== "scenario")) } : data;
      Object.entries(root).forEach(([k, v]) => renderKey(k, v, rootId, 1, 1));
    } else if (isPrimitive(data) && data !== null && data !== "") {
      renderKey("data", data, rootId, 1, 1);
    }

    return { nodes: n, edges: e, isEmpty: produced === 0 };
  }, [data, scenario.title, scenario.description, lang, t]);

  const jsonText = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data ?? "");
    }
  }, [data]);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      toast.success(t("scenarioViewer.copied"));
    } catch {
      toast.error(t("scenarioViewer.copyFailed"));
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl border border-border w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">{scenario.title}</h2>
            <p className="text-xs text-muted-foreground">{t("scenarioViewer.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setTab("schema")}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs ${tab === "schema" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted"}`}
              >
                <Network className="w-3.5 h-3.5" />
                {t("scenarioViewer.tabSchema")}
              </button>
              <button
                type="button"
                onClick={() => setTab("json")}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs ${tab === "json" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted"}`}
              >
                <Braces className="w-3.5 h-3.5" />
                {t("scenarioViewer.tabJson")}
              </button>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {tab === "schema" ? (
          <div className="flex-1 relative">
            {isEmpty && (
              <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-background">
                <div className="text-center max-w-sm">
                  <p className="text-sm font-medium text-foreground">{t("scenarioViewer.emptyTitle")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("scenarioViewer.emptyDesc")}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setTab("json")}>
                    {t("scenarioViewer.tabJson")}
                  </Button>
                </div>
              </div>
            )}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                style={{ background: "hsl(var(--muted))" }}
                maskColor="hsl(var(--background) / 0.7)"
              />
            </ReactFlow>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4 relative">
            <Button
              variant="outline"
              size="sm"
              className="absolute right-6 top-6 gap-1"
              onClick={copyJson}
            >
              <Copy className="w-3.5 h-3.5" />
              {t("scenarioViewer.copy")}
            </Button>
            <pre className="text-[11px] leading-relaxed text-foreground whitespace-pre-wrap break-words font-mono">
              {jsonText}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScenarioSchemaViewer;
