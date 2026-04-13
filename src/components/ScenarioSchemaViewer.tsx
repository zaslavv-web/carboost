import { useMemo } from "react";
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
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScenarioSchemaViewerProps {
  scenario: any;
  onClose: () => void;
}

const ScenarioSchemaViewer = ({ scenario, onClose }: ScenarioSchemaViewerProps) => {
  const data = scenario.scenario_data;

  const { nodes, edges } = useMemo(() => {
    const n: Node[] = [];
    const e: Edge[] = [];

    // Determine structure
    const hasScenarioBlock = data?.scenario || data?.title;
    const scenarioBlock = data?.scenario || data;
    const questions: any[] = scenarioBlock?.questions || [];
    const competencies: string[] = scenarioBlock?.competencies || [];
    const keyPoints: string[] = data?.key_points || [];

    const centerX = 400;
    let yOffset = 0;

    // Root node — scenario title
    const rootTitle = scenarioBlock?.title || scenario.title;
    n.push({
      id: "root",
      position: { x: centerX - 120, y: yOffset },
      data: {
        label: (
          <div className="text-center max-w-[220px]">
            <div className="font-bold text-sm">{rootTitle}</div>
            {scenarioBlock?.description && (
              <div className="text-[10px] mt-1 opacity-70 line-clamp-2">{scenarioBlock.description}</div>
            )}
          </div>
        ),
      },
      sourcePosition: Position.Bottom,
      style: {
        background: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
        borderRadius: "16px",
        padding: "14px 18px",
        border: "none",
        minWidth: "240px",
        boxShadow: "0 4px 20px hsl(var(--primary) / 0.25)",
      },
    });
    yOffset += 120;

    // Summary node
    if (data?.summary) {
      n.push({
        id: "summary",
        position: { x: centerX - 140, y: yOffset },
        data: {
          label: (
            <div className="max-w-[260px]">
              <div className="font-semibold text-xs mb-1">Резюме</div>
              <div className="text-[10px] opacity-80 line-clamp-3">{data.summary}</div>
            </div>
          ),
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        style: {
          background: "hsl(var(--accent))",
          color: "hsl(var(--accent-foreground))",
          borderRadius: "12px",
          padding: "10px 14px",
          border: "1px solid hsl(var(--border))",
          minWidth: "280px",
        },
      });
      e.push({
        id: "root-summary",
        source: "root",
        target: "summary",
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "hsl(var(--primary))" },
      });
      yOffset += 110;
    }

    // Key points
    if (keyPoints.length > 0) {
      const kpId = "keypoints";
      n.push({
        id: kpId,
        position: { x: centerX - 140, y: yOffset },
        data: {
          label: (
            <div className="max-w-[260px]">
              <div className="font-semibold text-xs mb-1">Ключевые пункты</div>
              <ul className="text-[10px] opacity-80 space-y-0.5 list-disc list-inside">
                {keyPoints.slice(0, 5).map((kp, i) => (
                  <li key={i} className="line-clamp-1">{kp}</li>
                ))}
                {keyPoints.length > 5 && <li>...ещё {keyPoints.length - 5}</li>}
              </ul>
            </div>
          ),
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        style: {
          background: "hsl(var(--muted))",
          color: "hsl(var(--muted-foreground))",
          borderRadius: "12px",
          padding: "10px 14px",
          border: "1px solid hsl(var(--border))",
          minWidth: "280px",
        },
      });
      e.push({
        id: `${data?.summary ? "summary" : "root"}-kp`,
        source: data?.summary ? "summary" : "root",
        target: kpId,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "hsl(var(--muted-foreground))" },
      });
      yOffset += 130;
    }

    // Questions hub
    if (questions.length > 0) {
      const hubId = "questions-hub";
      n.push({
        id: hubId,
        position: { x: centerX - 80, y: yOffset },
        data: {
          label: (
            <div className="text-center">
              <div className="font-semibold text-xs">Вопросы оценки</div>
              <div className="text-[10px] opacity-70">{questions.length} вопросов</div>
            </div>
          ),
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        style: {
          background: "hsl(var(--card))",
          color: "hsl(var(--card-foreground))",
          borderRadius: "12px",
          padding: "10px 16px",
          border: "2px solid hsl(var(--primary))",
          minWidth: "160px",
        },
      });
      const prevNode = keyPoints.length > 0 ? "keypoints" : data?.summary ? "summary" : "root";
      e.push({
        id: `${prevNode}-hub`,
        source: prevNode,
        target: hubId,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "hsl(var(--primary))" },
      });
      yOffset += 100;

      // Individual questions
      const cols = Math.min(questions.length, 3);
      const colWidth = 280;
      const startX = centerX - ((cols - 1) * colWidth) / 2 - 120;

      questions.forEach((q, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const qId = `q-${i}`;
        n.push({
          id: qId,
          position: { x: startX + col * colWidth, y: yOffset + row * 130 },
          data: {
            label: (
              <div className="max-w-[230px]">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-[10px] opacity-50">#{i + 1}</span>
                  {q.max_score && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      макс. {q.max_score}
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-medium line-clamp-2">{q.question}</div>
                {q.criteria && (
                  <div className="text-[9px] mt-1 opacity-60 line-clamp-1">
                    Критерий: {q.criteria}
                  </div>
                )}
              </div>
            ),
          },
          targetPosition: Position.Top,
          sourcePosition: Position.Bottom,
          style: {
            background: "hsl(var(--card))",
            color: "hsl(var(--card-foreground))",
            borderRadius: "10px",
            padding: "10px 12px",
            border: "1px solid hsl(var(--border))",
            minWidth: "250px",
          },
        });
        e.push({
          id: `hub-q${i}`,
          source: hubId,
          target: qId,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: "hsl(var(--border))" },
        });
      });

      const qRows = Math.ceil(questions.length / cols);
      yOffset += qRows * 130 + 20;
    }

    // Competencies
    if (competencies.length > 0) {
      const compHubId = "comp-hub";
      n.push({
        id: compHubId,
        position: { x: centerX - 100, y: yOffset },
        data: {
          label: (
            <div className="text-center">
              <div className="font-semibold text-xs mb-1">Оцениваемые компетенции</div>
              <div className="flex flex-wrap gap-1 justify-center max-w-[200px]">
                {competencies.map((c, i) => (
                  <span
                    key={i}
                    className="text-[9px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ),
        },
        targetPosition: Position.Top,
        style: {
          background: "hsl(var(--card))",
          color: "hsl(var(--card-foreground))",
          borderRadius: "14px",
          padding: "14px 18px",
          border: "2px dashed hsl(var(--primary) / 0.4)",
          minWidth: "220px",
        },
      });

      // Connect from questions hub or root
      const sourceForComp = questions.length > 0 ? "questions-hub" : keyPoints.length > 0 ? "keypoints" : "root";
      e.push({
        id: `${sourceForComp}-comp`,
        source: sourceForComp,
        target: compHubId,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "hsl(var(--primary))", strokeDasharray: "5 5" },
      });
    }

    // Handle array-based scenarios (plain data table)
    if (Array.isArray(data) && data.length > 0 && !hasScenarioBlock) {
      const keys = Object.keys(data[0] || {});
      // Show structure as a table-like node
      n.push({
        id: "data-structure",
        position: { x: centerX - 120, y: 120 },
        data: {
          label: (
            <div className="max-w-[260px]">
              <div className="font-semibold text-xs mb-1">Структура данных</div>
              <div className="text-[10px] opacity-70 mb-1">{data.length} записей</div>
              <div className="flex flex-wrap gap-1">
                {keys.map((k, i) => (
                  <span key={i} className="text-[9px] px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ),
        },
        targetPosition: Position.Top,
        style: {
          background: "hsl(var(--card))",
          color: "hsl(var(--card-foreground))",
          borderRadius: "12px",
          padding: "12px 16px",
          border: "1px solid hsl(var(--border))",
          minWidth: "260px",
        },
      });
      e.push({
        id: "root-data",
        source: "root",
        target: "data-structure",
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "hsl(var(--primary))" },
      });

      // Show first 3 rows as samples
      data.slice(0, 3).forEach((row: any, i: number) => {
        const rowId = `row-${i}`;
        n.push({
          id: rowId,
          position: { x: 60 + i * 300, y: 260 },
          data: {
            label: (
              <div className="max-w-[240px]">
                <div className="font-semibold text-[10px] opacity-50 mb-1">Запись #{i + 1}</div>
                {keys.slice(0, 4).map((k) => (
                  <div key={k} className="text-[10px] truncate">
                    <span className="font-medium">{k}:</span>{" "}
                    <span className="opacity-70">{String(row[k] || "—").substring(0, 40)}</span>
                  </div>
                ))}
              </div>
            ),
          },
          targetPosition: Position.Top,
          style: {
            background: "hsl(var(--muted))",
            color: "hsl(var(--muted-foreground))",
            borderRadius: "10px",
            padding: "8px 12px",
            border: "1px solid hsl(var(--border))",
          },
        });
        e.push({
          id: `data-row${i}`,
          source: "data-structure",
          target: rowId,
          style: { stroke: "hsl(var(--border))" },
        });
      });
    }

    return { nodes: n, edges: e };
  }, [data, scenario.title]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl border border-border w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{scenario.title}</h2>
            <p className="text-xs text-muted-foreground">Схема сценария оценки</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.3 }}
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
      </div>
    </div>
  );
};

export default ScenarioSchemaViewer;