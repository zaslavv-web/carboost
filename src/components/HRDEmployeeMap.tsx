import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  MarkerType,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Plus,
  Coins,
  TrendingUp,
  ShoppingBag,
  CheckCircle2,
  Clock,
  X,
  Users as UsersIcon,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatCoins } from "@/hooks/useCurrency";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  Legend,
} from "recharts";

interface Employee {
  user_id: string;
  full_name: string;
  position: string | null;
  department: string | null;
  avatar_url: string | null;
  overall_score: number | null;
  role_readiness: number | null;
}

interface TeamLink {
  manager_id: string;
  employee_id: string;
}

interface HrTask {
  id: string;
  title: string;
  description: string | null;
  category: string;
  reward_coins: number;
  deadline: string | null;
  status: string;
  created_by: string;
  created_at: string;
  reviewed_at: string | null;
  assignees: { user_id: string; individual_status: string; reward_paid: boolean }[];
}

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--info))", "hsl(var(--warning))", "hsl(var(--success))", "hsl(var(--destructive))"];

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

const HRDEmployeeMap = () => {
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const companyId = profile?.company_id;
  const qc = useQueryClient();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [taskFormFromId, setTaskFormFromId] = useState<string | null>(null);
  const [taskFormToId, setTaskFormToId] = useState<string | null>(null);

  // Employees in company
  const { data: employees = [], isLoading: loadingEmps } = useQuery({
    queryKey: ["hrd_map_employees", companyId],
    queryFn: async () => {
      if (!companyId) return [] as Employee[];
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, position, department, avatar_url, overall_score, role_readiness")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data || []) as Employee[];
    },
    enabled: !!companyId,
  });

  // Manager → employee links
  const { data: teamLinks = [] } = useQuery({
    queryKey: ["hrd_map_team_links", companyId],
    queryFn: async () => {
      if (!companyId) return [] as TeamLink[];
      const { data, error } = await supabase
        .from("team_members")
        .select("manager_id, employee_id")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data || []) as TeamLink[];
    },
    enabled: !!companyId,
  });

  // HR tasks (for HR-created connections)
  const { data: hrTasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ["hrd_map_hr_tasks", companyId],
    queryFn: async () => {
      if (!companyId) return [] as HrTask[];
      const { data: tasks, error } = await supabase
        .from("hr_tasks")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (tasks || []).map((t) => t.id);
      let assignees: any[] = [];
      if (ids.length > 0) {
        const { data: a, error: aErr } = await supabase
          .from("hr_task_assignees")
          .select("task_id, user_id, individual_status, reward_paid")
          .in("task_id", ids);
        if (aErr) throw aErr;
        assignees = a || [];
      }
      return (tasks || []).map((t) => ({
        ...t,
        assignees: assignees
          .filter((a) => a.task_id === t.id)
          .map(({ user_id, individual_status, reward_paid }) => ({
            user_id,
            individual_status,
            reward_paid,
          })),
      })) as HrTask[];
    },
    enabled: !!companyId,
  });

  // Currency balances per user
  const { data: balances = [] } = useQuery({
    queryKey: ["hrd_map_balances", companyId],
    queryFn: async () => {
      if (!companyId) return [] as { user_id: string; balance: number }[];
      const { data, error } = await supabase
        .from("currency_balances")
        .select("user_id, balance")
        .eq("company_id", companyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Build graph
  const layouted = useMemo(() => {
    if (employees.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] };

    // Group by department for grid positioning
    const byDept = new Map<string, Employee[]>();
    employees.forEach((e) => {
      const k = e.department || "—";
      if (!byDept.has(k)) byDept.set(k, []);
      byDept.get(k)!.push(e);
    });

    const nodes: Node[] = [];
    const colW = 280;
    const rowH = 130;
    let col = 0;
    Array.from(byDept.entries()).forEach(([dept, emps]) => {
      emps.forEach((e, idx) => {
        const isSelected = selectedEmployeeId === e.user_id;
        nodes.push({
          id: e.user_id,
          position: { x: col * colW, y: idx * rowH },
          data: {
            label: (
              <div className="text-left">
                <div className="font-semibold text-xs truncate max-w-[200px]">{e.full_name || "Без имени"}</div>
                <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                  {e.position || "—"}
                </div>
                <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{dept}</div>
              </div>
            ),
          },
          style: {
            background: isSelected ? "hsl(var(--primary) / 0.15)" : "hsl(var(--card))",
            border: isSelected ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
            borderRadius: 12,
            padding: 10,
            color: "hsl(var(--foreground))",
            width: 220,
          },
        });
      });
      col++;
    });

    const edges: Edge[] = [];
    // Manager edges (vertical hierarchy)
    teamLinks.forEach((l, i) => {
      edges.push({
        id: `mgr-${i}`,
        source: l.manager_id,
        target: l.employee_id,
        type: "smoothstep",
        animated: false,
        style: { stroke: "hsl(var(--info))", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--info))" },
        label: "руководит",
        labelStyle: { fill: "hsl(var(--muted-foreground))", fontSize: 10 },
      });
    });

    // HR-task edges (horizontal): from creator to each assignee
    hrTasks.forEach((t) => {
      t.assignees.forEach((a) => {
        if (a.user_id === t.created_by) return;
        const color =
          t.status === "completed"
            ? "hsl(var(--success))"
            : t.status === "in_review"
            ? "hsl(var(--warning))"
            : t.status === "rejected" || t.status === "cancelled"
            ? "hsl(var(--destructive))"
            : "hsl(var(--primary))";
        edges.push({
          id: `task-${t.id}-${a.user_id}`,
          source: t.created_by,
          target: a.user_id,
          type: "default",
          animated: t.status === "in_review",
          style: { stroke: color, strokeWidth: 1.5, strokeDasharray: "5 4" },
          markerEnd: { type: MarkerType.Arrow, color },
          label: `🎯 ${t.title.slice(0, 18)}${t.reward_coins ? ` · ${t.reward_coins}🪙` : ""}`,
          labelStyle: { fill: "hsl(var(--foreground))", fontSize: 10, fontWeight: 500 },
          labelBgStyle: { fill: "hsl(var(--card))" },
        });
      });
    });

    return { nodes, edges };
  }, [employees, teamLinks, hrTasks, selectedEmployeeId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layouted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layouted.edges);

  // Sync when source data changes
  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layouted, setNodes, setEdges]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedEmployeeId(node.id);
  }, []);

  const selected = employees.find((e) => e.user_id === selectedEmployeeId) || null;

  const balanceMap = useMemo(() => {
    const m = new Map<string, number>();
    balances.forEach((b) => m.set(b.user_id, b.balance));
    return m;
  }, [balances]);

  // Effectiveness composite per employee (used for sidebar)
  const { data: composite } = useQuery({
    queryKey: ["hrd_map_composite", selectedEmployeeId, companyId],
    queryFn: async () => {
      if (!selectedEmployeeId || !companyId) return null;
      // Track progress
      const { data: assignments } = await supabase
        .from("employee_career_assignments")
        .select("template_id, current_step, status")
        .eq("user_id", selectedEmployeeId);
      let trackProgress = 0;
      if (assignments && assignments.length > 0) {
        const tplIds = assignments.map((a) => a.template_id);
        const { data: tpls } = await supabase
          .from("career_track_templates")
          .select("id, steps")
          .in("id", tplIds);
        const tplMap = new Map((tpls || []).map((t: any) => [t.id, (t.steps as any[])?.length || 1]));
        const totals = assignments.map((a) => {
          const total = tplMap.get(a.template_id) || 1;
          return Math.min(100, Math.round(((a.current_step || 0) / total) * 100));
        });
        trackProgress = Math.round(totals.reduce((s, n) => s + n, 0) / totals.length);
      }

      // HR tasks completion %
      const myTasks = hrTasks.filter((t) =>
        t.assignees.some((a) => a.user_id === selectedEmployeeId),
      );
      const completedTasks = myTasks.filter((t) => t.status === "completed").length;
      const taskRatio = myTasks.length > 0 ? Math.round((completedTasks / myTasks.length) * 100) : 0;

      // Rewards count
      const { count: rewardsCount } = await supabase
        .from("employee_rewards")
        .select("*", { count: "exact", head: true })
        .eq("user_id", selectedEmployeeId);

      const overall = selected?.overall_score || 0;
      const composite = Math.round(
        trackProgress * 0.35 +
          taskRatio * 0.25 +
          overall * 0.25 +
          Math.min(100, (rewardsCount || 0) * 10) * 0.15,
      );

      return { trackProgress, taskRatio, overall, rewardsCount: rewardsCount || 0, composite, totalTasks: myTasks.length, completedTasks };
    },
    enabled: !!selectedEmployeeId && !!companyId,
  });

  // Shop activity for selected
  const { data: shopActivity } = useQuery({
    queryKey: ["hrd_map_shop", selectedEmployeeId],
    queryFn: async () => {
      if (!selectedEmployeeId) return null;
      const { data: orders } = await supabase
        .from("shop_orders")
        .select("id, status, total_amount, created_at")
        .eq("user_id", selectedEmployeeId)
        .order("created_at", { ascending: false });
      const orderIds = (orders || []).map((o) => o.id);
      let items: any[] = [];
      if (orderIds.length > 0) {
        const { data: it } = await supabase
          .from("shop_order_items")
          .select("order_id, product_id, product_title, quantity, subtotal")
          .in("order_id", orderIds);
        items = it || [];
      }
      // Aggregate by product_title
      const byProduct = new Map<string, number>();
      items.forEach((i) => {
        byProduct.set(i.product_title, (byProduct.get(i.product_title) || 0) + i.subtotal);
      });
      const spendBreakdown = Array.from(byProduct.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
      const totalSpent = items.reduce((s, i) => s + i.subtotal, 0);
      return { orders: orders || [], totalSpent, spendBreakdown, ordersCount: (orders || []).length };
    },
    enabled: !!selectedEmployeeId,
  });

  // Mutations: create HR task
  const createTaskMutation = useMutation({
    mutationFn: async (payload: {
      title: string;
      description: string;
      category: string;
      reward: number;
      deadline: string | null;
      assigneeIds: string[];
    }) => {
      if (!companyId || !user) throw new Error("Нет компании");
      const { data: task, error } = await supabase
        .from("hr_tasks")
        .insert({
          company_id: companyId,
          created_by: user.id,
          title: payload.title,
          description: payload.description || null,
          category: payload.category,
          reward_coins: payload.reward,
          deadline: payload.deadline,
        })
        .select()
        .single();
      if (error) throw error;
      if (payload.assigneeIds.length > 0) {
        const { error: aErr } = await supabase.from("hr_task_assignees").insert(
          payload.assigneeIds.map((uid) => ({ task_id: task.id, user_id: uid })),
        );
        if (aErr) throw aErr;
      }
      return task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hrd_map_hr_tasks"] });
      toast.success("HR-задача создана");
      setCreateTaskOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!user) return;
      const { error } = await supabase
        .from("hr_tasks")
        .update({ status: "completed", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hrd_map_hr_tasks"] });
      qc.invalidateQueries({ queryKey: ["hrd_map_balances"] });
      toast.success("Задача подтверждена, монеты начислены");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rejectTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!user) return;
      const { error } = await supabase
        .from("hr_tasks")
        .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hrd_map_hr_tasks"] });
      toast.success("Задача отклонена");
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from("hr_tasks").delete().eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hrd_map_hr_tasks"] });
      toast.success("Удалено");
    },
  });

  if (loadingEmps) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <UsersIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="font-semibold text-foreground mb-2">Нет сотрудников</h3>
        <p className="text-sm text-muted-foreground">Пригласите сотрудников, чтобы построить карту.</p>
      </div>
    );
  }

  const selectedTasks = selectedEmployeeId
    ? hrTasks.filter(
        (t) =>
          t.created_by === selectedEmployeeId ||
          t.assignees.some((a) => a.user_id === selectedEmployeeId),
      )
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Карта сотрудников</h3>
          <p className="text-xs text-muted-foreground">
            Сплошные стрелки — иерархия (руководитель → сотрудник). Пунктирные — горизонтальные HR-связи.
          </p>
        </div>
        <Button
          onClick={() => {
            setTaskFormFromId(user?.id || null);
            setTaskFormToId(selectedEmployeeId);
            setCreateTaskOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" /> Новая HR-задача
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
        <div
          className="bg-card rounded-xl border border-border overflow-hidden react-flow-contrast-cursor"
          style={{ height: "70vh" }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
            minZoom={0.2}
            maxZoom={1.5}
          >
            <Background color="hsl(var(--border))" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={() => "hsl(var(--primary))"}
              maskColor="hsl(var(--background) / 0.7)"
              style={{ background: "hsl(var(--card))" }}
            />
          </ReactFlow>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col">
          {!selected ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Кликните по карточке сотрудника, чтобы увидеть детали
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-border flex items-start gap-3">
                <Avatar className="w-12 h-12">
                  <AvatarFallback>{initials(selected.full_name || "?")}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-foreground truncate">{selected.full_name}</h4>
                  <p className="text-xs text-muted-foreground truncate">
                    {selected.position || "—"} · {selected.department || "—"}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSelectedEmployeeId(null)}
                  className="shrink-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <ScrollArea className="flex-1 max-h-[calc(70vh-72px)]">
                <Tabs defaultValue="overview" className="p-3">
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="overview">Обзор</TabsTrigger>
                    <TabsTrigger value="tasks">Задачи</TabsTrigger>
                    <TabsTrigger value="shop">Магазин</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-3 mt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-secondary/50 rounded-lg p-3">
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> Эффективность
                        </div>
                        <div className="text-2xl font-bold text-foreground">{composite?.composite ?? 0}</div>
                      </div>
                      <div className="bg-secondary/50 rounded-lg p-3">
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Coins className="w-3 h-3" /> Баланс
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                          {formatCoins(balanceMap.get(selected.user_id) || 0)}
                        </div>
                      </div>
                    </div>
                    {composite && (
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Прогресс по треку</span>
                          <span className="font-medium">{composite.trackProgress}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">HR-задачи (выполнено)</span>
                          <span className="font-medium">
                            {composite.completedTasks}/{composite.totalTasks} ({composite.taskRatio}%)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Оценка профиля</span>
                          <span className="font-medium">{composite.overall}/100</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Награды</span>
                          <span className="font-medium">{composite.rewardsCount}</span>
                        </div>
                      </div>
                    )}
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={() => {
                        setTaskFormFromId(user?.id || null);
                        setTaskFormToId(selected.user_id);
                        setCreateTaskOpen(true);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" /> Назначить HR-задачу
                    </Button>
                  </TabsContent>

                  <TabsContent value="tasks" className="space-y-2 mt-3">
                    {selectedTasks.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Нет HR-задач, связанных с сотрудником
                      </p>
                    )}
                    {selectedTasks.map((t) => (
                      <div key={t.id} className="border border-border rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-foreground truncate">{t.title}</div>
                            {t.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                            )}
                          </div>
                          <Badge
                            variant={
                              t.status === "completed"
                                ? "default"
                                : t.status === "in_review"
                                ? "secondary"
                                : t.status === "rejected"
                                ? "destructive"
                                : "outline"
                            }
                            className="shrink-0 text-[10px]"
                          >
                            {t.status === "open" && "Открыта"}
                            {t.status === "in_review" && "На проверке"}
                            {t.status === "completed" && "Выполнена"}
                            {t.status === "rejected" && "Отклонена"}
                            {t.status === "cancelled" && "Отменена"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Coins className="w-3 h-3" /> {t.reward_coins}
                          </span>
                          {t.deadline && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {new Date(t.deadline).toLocaleDateString("ru-RU")}
                            </span>
                          )}
                          <span>· {t.assignees.length} исп.</span>
                        </div>
                        {t.status !== "completed" && t.status !== "cancelled" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs flex-1"
                              onClick={() => completeTaskMutation.mutate(t.id)}
                              disabled={completeTaskMutation.isPending}
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Подтвердить
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => rejectTaskMutation.mutate(t.id)}
                            >
                              Отклонить
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => deleteTaskMutation.mutate(t.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="shop" className="space-y-3 mt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-secondary/50 rounded-lg p-3">
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <ShoppingBag className="w-3 h-3" /> Заказов
                        </div>
                        <div className="text-2xl font-bold text-foreground">{shopActivity?.ordersCount ?? 0}</div>
                      </div>
                      <div className="bg-secondary/50 rounded-lg p-3">
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Coins className="w-3 h-3" /> Потрачено
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                          {formatCoins(shopActivity?.totalSpent || 0)}
                        </div>
                      </div>
                    </div>
                    {shopActivity && shopActivity.spendBreakdown.length > 0 ? (
                      <div>
                        <div className="text-xs font-medium text-foreground mb-2">На что тратит</div>
                        <ResponsiveContainer width="100%" height={180}>
                          <PieChart>
                            <Pie
                              data={shopActivity.spendBreakdown}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={60}
                              label={(e) => `${e.name?.slice(0, 10)}`}
                            >
                              {shopActivity.spendBreakdown.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <RTooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Сотрудник пока не делал заказов
                      </p>
                    )}
                  </TabsContent>
                </Tabs>
              </ScrollArea>
            </>
          )}
        </div>
      </div>

      <CreateHrTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        employees={employees}
        defaultAssigneeId={taskFormToId}
        onSubmit={(payload) => createTaskMutation.mutate(payload)}
        isPending={createTaskMutation.isPending}
      />
    </div>
  );
};

interface CreateHrTaskDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: Employee[];
  defaultAssigneeId: string | null;
  onSubmit: (p: {
    title: string;
    description: string;
    category: string;
    reward: number;
    deadline: string | null;
    assigneeIds: string[];
  }) => void;
  isPending: boolean;
}

const CATEGORIES = [
  { value: "collaboration", label: "Совместная работа" },
  { value: "mentorship", label: "Менторство" },
  { value: "knowledge_sharing", label: "Обмен знаниями" },
  { value: "project", label: "Проект" },
  { value: "onboarding", label: "Онбординг" },
];

const CreateHrTaskDialog = ({
  open,
  onOpenChange,
  employees,
  defaultAssigneeId,
  onSubmit,
  isPending,
}: CreateHrTaskDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("collaboration");
  const [reward, setReward] = useState(50);
  const [deadline, setDeadline] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(defaultAssigneeId ? [defaultAssigneeId] : []);

  // Reset on open
  useMemo(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setCategory("collaboration");
      setReward(50);
      setDeadline("");
      setAssigneeIds(defaultAssigneeId ? [defaultAssigneeId] : []);
    }
  }, [open, defaultAssigneeId]);

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = () => {
    if (!title.trim()) {
      toast.error("Укажите название");
      return;
    }
    if (assigneeIds.length === 0) {
      toast.error("Выберите хотя бы одного исполнителя");
      return;
    }
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      category,
      reward: Number(reward) || 0,
      deadline: deadline || null,
      assigneeIds,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Новая HR-задача</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Провести воркшоп для команды" />
          </div>
          <div>
            <Label>Описание</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Категория</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Награда (монеты)</Label>
              <Input type="number" min={0} value={reward} onChange={(e) => setReward(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label>Дедлайн</Label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div>
            <Label>Исполнители ({assigneeIds.length})</Label>
            <ScrollArea className="h-40 border border-border rounded-lg p-2 mt-1">
              <div className="space-y-1">
                {employees.map((e) => (
                  <button
                    key={e.user_id}
                    type="button"
                    onClick={() => toggleAssignee(e.user_id)}
                    className={`w-full flex items-center gap-2 p-2 rounded text-left text-sm transition-colors ${
                      assigneeIds.includes(e.user_id)
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-secondary"
                    }`}
                  >
                    <Avatar className="w-6 h-6">
                      <AvatarFallback className="text-[10px]">{initials(e.full_name || "?")}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-xs font-medium">{e.full_name}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {e.position || "—"}
                      </div>
                    </div>
                    {assigneeIds.includes(e.user_id) && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HRDEmployeeMap;
