/**
 * BPMN-стиль граф бизнес-окружения пользователя на @xyflow/react.
 *
 * Узлы (pool «Текущее»): руководитель отдела → менеджер → пользователь;
 * подчинённые слева, коллеги справа.
 * Pool «Через год» (полупрозрачный, пунктирные стрелки) — целевая должность
 * и ожидаемые навыки/цели по активному треку.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ReactFlow, Background, Controls, MarkerType,
  type Node, type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { laravel } from "@/integrations/laravel/client";

type Person = {
  user_id: string;
  full_name: string;
  position?: string | null;
  department?: string | null;
  avatar_url?: string | null;
  email?: string | null;
};

type EnvData = {
  user: Person;
  manager: Person | null;
  direct_reports: Person[];
  department_head: Person | null;
  peers: Person[];
  interactions: { with_user_id: string; type: string; weight: number }[];
  future_projection: {
    target_position: { id: string; title: string; level?: number | null } | null;
    track_template: { id: string; title?: string | null } | null;
    current_step: number;
    total_steps: number;
    expected_items: string[];
  } | null;
};

const personLabel = (p: Person | null, prefix?: string) => {
  if (!p) return prefix || "—";
  return `${prefix ? prefix + ": " : ""}${p.full_name}${p.position ? "\n" + p.position : ""}`;
};

const buildGraph = (env: EnvData, showFuture: boolean): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const baseStyle = {
    padding: 10,
    borderRadius: 8,
    fontSize: 12,
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--card))",
    color: "hsl(var(--foreground))",
    width: 200,
    whiteSpace: "pre-wrap" as const,
    textAlign: "center" as const,
  };

  // user (центр)
  nodes.push({
    id: env.user.user_id,
    position: { x: 350, y: 280 },
    data: { label: personLabel(env.user) },
    style: { ...baseStyle, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", fontWeight: 600 },
  });

  if (env.department_head) {
    nodes.push({
      id: `head-${env.department_head.user_id}`,
      position: { x: 350, y: 20 },
      data: { label: personLabel(env.department_head, "Глава отдела") },
      style: baseStyle,
    });
  }

  if (env.manager) {
    nodes.push({
      id: `mgr-${env.manager.user_id}`,
      position: { x: 350, y: 140 },
      data: { label: personLabel(env.manager, "Руководитель") },
      style: baseStyle,
    });
    edges.push({
      id: `e-mgr-user`,
      source: `mgr-${env.manager.user_id}`,
      target: env.user.user_id,
      label: "подчиняется",
      labelStyle: { fontSize: 10 },
      markerEnd: { type: MarkerType.ArrowClosed },
    });
    if (env.department_head && env.department_head.user_id !== env.manager.user_id) {
      edges.push({
        id: `e-head-mgr`,
        source: `head-${env.department_head.user_id}`,
        target: `mgr-${env.manager.user_id}`,
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }
  } else if (env.department_head) {
    edges.push({
      id: `e-head-user`,
      source: `head-${env.department_head.user_id}`,
      target: env.user.user_id,
      markerEnd: { type: MarkerType.ArrowClosed },
    });
  }

  env.direct_reports.slice(0, 4).forEach((r, i) => {
    const id = `dr-${r.user_id}`;
    nodes.push({
      id,
      position: { x: 40, y: 140 + i * 90 },
      data: { label: personLabel(r, "Подчинённый") },
      style: baseStyle,
    });
    edges.push({
      id: `e-user-${id}`,
      source: env.user.user_id,
      target: id,
      label: "управляет",
      labelStyle: { fontSize: 10 },
      markerEnd: { type: MarkerType.ArrowClosed },
    });
  });

  env.peers.slice(0, 4).forEach((p, i) => {
    const id = `peer-${p.user_id}`;
    nodes.push({
      id,
      position: { x: 660, y: 140 + i * 90 },
      data: { label: personLabel(p, "Коллега") },
      style: baseStyle,
    });
    edges.push({
      id: `e-user-${id}`,
      source: env.user.user_id,
      target: id,
      label: "взаимодействие",
      labelStyle: { fontSize: 10 },
      animated: true,
      style: { strokeDasharray: "4 4" },
    });
  });

  if (showFuture && env.future_projection?.target_position) {
    const fp = env.future_projection;
    nodes.push({
      id: "future",
      position: { x: 350, y: 480 },
      data: {
        label: `Через год\n${fp.target_position!.title}${
          fp.track_template?.title ? "\nтрек: " + fp.track_template.title : ""
        }${fp.total_steps ? `\nэтап ${fp.current_step}/${fp.total_steps}` : ""}`,
      },
      style: {
        ...baseStyle,
        background: "hsl(var(--accent))",
        color: "hsl(var(--accent-foreground))",
        borderStyle: "dashed",
        opacity: 0.9,
      },
    });
    edges.push({
      id: "e-user-future",
      source: env.user.user_id,
      target: "future",
      label: "цель",
      labelStyle: { fontSize: 10 },
      style: { strokeDasharray: "6 4" },
      markerEnd: { type: MarkerType.ArrowClosed },
    });
  }

  return { nodes, edges };
};

const UserBusinessEnvironment = ({ userId }: { userId: string }) => {
  const [showFuture, setShowFuture] = useState(true);

  const { data: env, isLoading, error } = useQuery({
    queryKey: ["user_environment", userId],
    queryFn: async () => {
      const { data, error } = await laravel.get<EnvData>(`/profiles/${userId}/environment`);
      if (error) throw new Error(error.message);
      return data!;
    },
  });

  const graph = useMemo(() => (env ? buildGraph(env, showFuture) : { nodes: [], edges: [] }), [env, showFuture]);

  if (isLoading) return <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto my-12" />;
  if (error) return <div className="text-destructive">{(error as Error).message}</div>;
  if (!env) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          Управляет: {env.direct_reports.length} • Коллег: {env.peers.length} • Взаимодействий (90д): {env.interactions.length}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showFuture}
            onChange={(e) => setShowFuture(e.target.checked)}
            className="rounded"
          />
          Показать проекцию через год
        </label>
      </div>

      <div className="bg-card rounded-xl border border-border" style={{ height: 620 }}>
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {env.future_projection?.expected_items && env.future_projection.expected_items.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-medium text-foreground mb-2">Ожидаемые навыки и цели</h3>
          <div className="flex flex-wrap gap-1.5">
            {env.future_projection.expected_items.map((it, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground">{it}</span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <PersonList title="Руководитель" items={env.manager ? [env.manager] : []} />
        <PersonList title="Подчинённые" items={env.direct_reports} />
        <PersonList title="Коллеги" items={env.peers} />
      </div>
    </div>
  );
};

const PersonList = ({ title, items }: { title: string; items: Person[] }) => (
  <div className="bg-card rounded-xl border border-border p-4">
    <h3 className="text-sm font-medium text-foreground mb-2">{title}</h3>
    {items.length === 0 ? (
      <p className="text-xs text-muted-foreground">—</p>
    ) : (
      <ul className="space-y-1.5">
        {items.map((p) => (
          <li key={p.user_id}>
            <Link to={`/users/${p.user_id}`} className="text-sm text-foreground hover:text-primary block truncate">
              {p.full_name}
              {p.position && <span className="text-muted-foreground"> • {p.position}</span>}
            </Link>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default UserBusinessEnvironment;
