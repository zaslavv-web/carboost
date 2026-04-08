import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Plus, Save, Trash2, Loader2, X } from "lucide-react";

interface Position {
  id: string;
  title: string;
  description: string | null;
  department: string | null;
  psychological_profile: any;
  competency_profile: any;
}

interface CareerPath {
  id: string;
  from_position_id: string;
  to_position_id: string;
  strategy_description: string | null;
  requirements: any;
  estimated_months: number | null;
}

const PositionEditor = ({
  position,
  onClose,
  onSave,
}: {
  position: Position | null;
  onClose: () => void;
  onSave: (data: Partial<Position>) => void;
}) => {
  const [form, setForm] = useState({
    title: position?.title || "",
    description: position?.description || "",
    department: position?.department || "",
    psychological_profile: JSON.stringify(position?.psychological_profile || {}, null, 2),
    competency_profile: JSON.stringify(position?.competency_profile || [], null, 2),
  });

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {position ? "Редактирование должности" : "Новая должность"}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground">Название</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              placeholder="Например: Frontend разработчик"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Описание</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 min-h-[60px]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Отдел</label>
            <input
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Психологический портрет-эталон (JSON)</label>
            <textarea
              value={form.psychological_profile}
              onChange={(e) => setForm({ ...form, psychological_profile: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/20 min-h-[100px]"
              placeholder='{"лидерство": "высокое", "стрессоустойчивость": "средняя"}'
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Профиль компетенций (JSON)</label>
            <textarea
              value={form.competency_profile}
              onChange={(e) => setForm({ ...form, competency_profile: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/20 min-h-[100px]"
              placeholder='[{"name": "JavaScript", "required_level": 8}]'
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button
            onClick={() => {
              let psych = {};
              let comp = [];
              try { psych = JSON.parse(form.psychological_profile); } catch {}
              try { comp = JSON.parse(form.competency_profile); } catch {}
              onSave({
                title: form.title,
                description: form.description || null,
                department: form.department || null,
                psychological_profile: psych,
                competency_profile: comp,
              });
            }}
            disabled={!form.title}
          >
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
};

const Positions = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingPosition, setEditingPosition] = useState<Position | null | "new">(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [hasUnsavedPaths, setHasUnsavedPaths] = useState(false);

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

  // Build graph from data
  useMemo(() => {
    if (posLoading || pathsLoading) return;

    const cols = 3;
    const newNodes: Node[] = positions.map((p, i) => ({
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
        background: "hsl(var(--card))",
        border: "2px solid hsl(var(--primary))",
        borderRadius: "12px",
        padding: "12px 16px",
        color: "hsl(var(--card-foreground))",
        minWidth: "180px",
      },
    }));

    const newEdges: Edge[] = careerPaths.map((cp) => ({
      id: cp.id,
      source: cp.from_position_id,
      target: cp.to_position_id,
      label: cp.estimated_months ? `~${cp.estimated_months} мес.` : undefined,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "hsl(var(--primary))" },
      labelStyle: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
    }));

    setNodes(newNodes);
    setEdges(newEdges);
  }, [positions, careerPaths, posLoading, pathsLoading]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({
        ...params,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "hsl(var(--primary))" },
        id: `temp-${Date.now()}`,
      }, eds));
      setHasUnsavedPaths(true);
    },
    [setEdges]
  );

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
      // Delete all existing paths
      const { data: existing } = await supabase.from("position_career_paths").select("id");
      if (existing && existing.length > 0) {
        for (const row of existing) {
          await supabase.from("position_career_paths").delete().eq("id", row.id);
        }
      }

      // Insert current edges
      const pathsToInsert = edges
        .filter((e) => e.source && e.target)
        .map((e) => ({
          from_position_id: e.source,
          to_position_id: e.target,
          created_by: user!.id,
        }));

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

  const onNodeDoubleClick = useCallback((_: any, node: Node) => {
    const pos = positions.find((p) => p.id === node.id);
    if (pos) setEditingPosition(pos);
  }, [positions]);

  if (posLoading || pathsLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Должности и карьерные пути</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Управляйте должностями и стройте карьерные стратегии. Дважды кликните на узел для редактирования.
          </p>
        </div>
        <Button onClick={() => setEditingPosition("new")}>
          <Plus className="w-4 h-4" /> Добавить должность
        </Button>
      </div>

      {/* Graph editor */}
      <div className="bg-card rounded-xl border border-border" style={{ height: "600px" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={(changes) => {
            onEdgesChange(changes);
            if (changes.some((c) => c.type === "remove")) setHasUnsavedPaths(true);
          }}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          fitView
          deleteKeyCode="Delete"
        >
          <Background />
          <Controls />
          <MiniMap
            style={{ background: "hsl(var(--card))" }}
            maskColor="hsl(var(--muted) / 0.5)"
          />
          <Panel position="top-right">
            <div className="flex gap-2">
              {hasUnsavedPaths && (
                <Button size="sm" onClick={() => savePathsMutation.mutate()} disabled={savePathsMutation.isPending}>
                  <Save className="w-4 h-4" /> Сохранить связи
                </Button>
              )}
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Positions table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Список должностей</h3>
        </div>
        <div className="divide-y divide-border">
          {positions.map((p) => (
            <div key={p.id} className="p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{p.title}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {p.department || "Без отдела"} {p.description ? `· ${p.description}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setEditingPosition(p)}>
                  Редактировать
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => deleteMutation.mutate(p.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          {positions.length === 0 && (
            <p className="p-8 text-center text-muted-foreground">Должности ещё не созданы</p>
          )}
        </div>
      </div>

      {/* Editor modal */}
      {editingPosition && (
        <PositionEditor
          position={editingPosition === "new" ? null : editingPosition}
          onClose={() => setEditingPosition(null)}
          onSave={(data) => {
            if (editingPosition !== "new" && editingPosition) {
              saveMutation.mutate({ ...data, id: editingPosition.id });
            } else {
              saveMutation.mutate(data);
            }
          }}
        />
      )}
    </div>
  );
};

export default Positions;
