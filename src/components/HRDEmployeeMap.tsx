import { useCallback, useEffect, useMemo, useState } from "react";
import { tooltipProps } from "@/lib/chartTooltip";
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
import { laravelDb } from "@/integrations/laravel/db";
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
  ChevronRight,
  ArrowUp,
  Building2,
} from "lucide-react";

import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "@/lib/dateLocale";
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
  const { t } = useTranslation("manager");
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const companyId = profile?.company_id;
  const qc = useQueryClient();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [taskFormFromId, setTaskFormFromId] = useState<string | null>(null);
  const [taskFormToId, setTaskFormToId] = useState<string | null>(null);

  // Cascading map navigation (stormbpmn-style drill-down)
  const [mapLevel, setMapLevel] = useState<"company" | "department" | "team">("company");
  const [activeDept, setActiveDept] = useState<string | null>(null);
  const [activeTeamManagerId, setActiveTeamManagerId] = useState<string | null>(null);


  // Employees in company
  const { data: employees = [], isLoading: loadingEmps } = useQuery({
    queryKey: ["hrd_map_employees", companyId],
    queryFn: async () => {
      if (!companyId) return [] as Employee[];
      const { data, error } = await laravelDb
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
      const { data, error } = await laravelDb
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
      const { data: tasks, error } = await laravelDb
        .from("hr_tasks")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (tasks || []).map((t) => t.id);
      let assignees: any[] = [];
      if (ids.length > 0) {
        const { data: a, error: aErr } = await laravelDb
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
      const { data, error } = await laravelDb
        .from("currency_balances")
        .select("user_id, balance")
        .eq("company_id", companyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Precompute department/manager indices for cascading map
  const empById = useMemo(() => {
    const m = new Map<string, Employee>();
    employees.forEach((e) => m.set(e.user_id, e));
    return m;
  }, [employees]);

  const managerToEmployees = useMemo(() => {
    const m = new Map<string, string[]>();
    teamLinks.forEach((l) => {
      if (!m.has(l.manager_id)) m.set(l.manager_id, []);
      m.get(l.manager_id)!.push(l.employee_id);
    });
    return m;
  }, [teamLinks]);

  const employeeToManager = useMemo(() => {
    const m = new Map<string, string>();
    teamLinks.forEach((l) => m.set(l.employee_id, l.manager_id));
    return m;
  }, [teamLinks]);

  const deptOf = (uid: string | null | undefined) =>
    (uid && empById.get(uid)?.department) || "—";

  // Build graph depending on current drill-down level
  const layouted = useMemo(() => {
    if (employees.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] };

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // ============ LEVEL 1: COMPANY (departments) ============
    if (mapLevel === "company") {
      const byDept = new Map<string, Employee[]>();
      employees.forEach((e) => {
        const k = e.department || "—";
        if (!byDept.has(k)) byDept.set(k, []);
        byDept.get(k)!.push(e);
      });

      const entries = Array.from(byDept.entries());
      const cols = Math.max(1, Math.ceil(Math.sqrt(entries.length)));
      const colW = 320;
      const rowH = 200;
      entries.forEach(([dept, emps], i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        // Head = manager whose team lives in this dept (heuristic: employee with most reports here)
        const scores = emps.map((e) => e.overall_score ?? 0);
        const avg =
          scores.filter((s) => s > 0).length > 0
            ? (scores.reduce((a, b) => a + b, 0) / scores.filter((s) => s > 0).length).toFixed(1)
            : "—";
        const activeTasks = hrTasks.filter(
          (t) =>
            (t.status === "assigned" || t.status === "in_review") &&
            (deptOf(t.created_by) === dept || t.assignees.some((a) => deptOf(a.user_id) === dept)),
        ).length;
        nodes.push({
          id: `dept:${dept}`,
          position: { x: col * colW, y: row * rowH },
          data: {
            label: (
              <div className="text-left">
                <div className="flex items-center gap-1.5 mb-1">
                  <Building2 className="w-3.5 h-3.5 text-primary" />
                  <div className="font-semibold text-sm truncate max-w-[220px]">{dept}</div>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t("employeeMap.drill.people", { defaultValue: "Сотрудников" })}: <b className="text-foreground">{emps.length}</b>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t("employeeMap.drill.avgScore", { defaultValue: "Ср. балл" })}: <b className="text-foreground">{avg}</b>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t("employeeMap.drill.activeTasks", { defaultValue: "Активных задач" })}: <b className="text-foreground">{activeTasks}</b>
                </div>
                <div className="text-[10px] text-primary mt-1">→ {t("employeeMap.drill.open", { defaultValue: "открыть" })}</div>
              </div>
            ),
          },
          style: {
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 12,
            padding: 12,
            color: "hsl(var(--foreground))",
            width: 260,
            cursor: "pointer",
          },
        });
      });

      // Aggregate HR-task edges between departments
      const deptEdges = new Map<string, number>();
      hrTasks.forEach((tsk) => {
        const from = deptOf(tsk.created_by);
        tsk.assignees.forEach((a) => {
          const to = deptOf(a.user_id);
          if (from === to) return;
          const k = `${from}→${to}`;
          deptEdges.set(k, (deptEdges.get(k) || 0) + 1);
        });
      });
      deptEdges.forEach((count, k) => {
        const [from, to] = k.split("→");
        edges.push({
          id: `de-${k}`,
          source: `dept:${from}`,
          target: `dept:${to}`,
          type: "smoothstep",
          style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeDasharray: "5 4" },
          markerEnd: { type: MarkerType.Arrow, color: "hsl(var(--primary))" },
          label: `🎯 ${count}`,
          labelStyle: { fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 500 },
          labelBgStyle: { fill: "hsl(var(--card))" },
        });
      });

      return { nodes, edges };
    }

    // ============ LEVEL 2: DEPARTMENT (teams by manager) ============
    if (mapLevel === "department" && activeDept) {
      const deptEmps = employees.filter((e) => (e.department || "—") === activeDept);
      // Group by their manager (if within same dept)
      const groups = new Map<string, Employee[]>(); // key = manager_id or "__unmanaged__"
      deptEmps.forEach((e) => {
        const mgr = employeeToManager.get(e.user_id);
        const key = mgr && deptEmps.some((x) => x.user_id === mgr) ? mgr : "__unmanaged__";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(e);
      });

      const entries = Array.from(groups.entries());
      const cols = Math.max(1, Math.ceil(Math.sqrt(entries.length)));
      const colW = 320;
      const rowH = 200;
      entries.forEach(([key, members], i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const mgr = key !== "__unmanaged__" ? empById.get(key) : null;
        const scores = members.map((e) => e.overall_score ?? 0).filter((s) => s > 0);
        const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
        nodes.push({
          id: `team:${key}`,
          position: { x: col * colW, y: row * rowH },
          data: {
            label: (
              <div className="text-left">
                <div className="font-semibold text-sm truncate max-w-[220px]">
                  {mgr ? mgr.full_name : t("employeeMap.drill.unmanaged", { defaultValue: "Без руководителя" })}
                </div>
                {mgr && (
                  <div className="text-[10px] text-muted-foreground truncate max-w-[220px]">
                    {mgr.position || "—"}
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground mt-1">
                  {t("employeeMap.drill.teamSize", { defaultValue: "В команде" })}: <b className="text-foreground">{members.length}</b>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t("employeeMap.drill.avgScore", { defaultValue: "Ср. балл" })}: <b className="text-foreground">{avg}</b>
                </div>
                <div className="text-[10px] text-primary mt-1">→ {t("employeeMap.drill.open", { defaultValue: "открыть" })}</div>
              </div>
            ),
          },
          style: {
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 12,
            padding: 12,
            color: "hsl(var(--foreground))",
            width: 260,
            cursor: "pointer",
          },
        });
      });

      return { nodes, edges };
    }

    // ============ LEVEL 3: TEAM (individual employees) ============
    if (mapLevel === "team") {
      let members: Employee[] = [];
      if (activeTeamManagerId === "__unmanaged__" && activeDept) {
        members = employees.filter(
          (e) => (e.department || "—") === activeDept && !employeeToManager.get(e.user_id),
        );
      } else if (activeTeamManagerId) {
        const ids = new Set<string>([activeTeamManagerId, ...(managerToEmployees.get(activeTeamManagerId) || [])]);
        members = employees.filter((e) => ids.has(e.user_id));
      }

      const colW = 280;
      const rowH = 130;
      const cols = Math.max(1, Math.ceil(Math.sqrt(members.length)));
      members.forEach((e, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const isSelected = selectedEmployeeId === e.user_id;
        const isManager = e.user_id === activeTeamManagerId;
        nodes.push({
          id: e.user_id,
          position: { x: col * colW, y: row * rowH },
          data: {
            label: (
              <div className="text-left">
                <div className="font-semibold text-xs truncate max-w-[200px]">
                  {isManager ? "👑 " : ""}
                  {e.full_name || t("employeeMap.noName")}
                </div>
                <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                  {e.position || "—"}
                </div>
                <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                  {e.department || "—"}
                </div>
              </div>
            ),
          },
          style: {
            background: isSelected ? "hsl(var(--primary) / 0.15)" : "hsl(var(--card))",
            border: isSelected
              ? "2px solid hsl(var(--primary))"
              : isManager
              ? "1px solid hsl(var(--primary))"
              : "1px solid hsl(var(--border))",
            borderRadius: 12,
            padding: 10,
            color: "hsl(var(--foreground))",
            width: 220,
          },
        });
      });

      // Manager → employee edges within team
      const idSet = new Set(members.map((m) => m.user_id));
      teamLinks.forEach((l, i) => {
        if (!idSet.has(l.manager_id) || !idSet.has(l.employee_id)) return;
        edges.push({
          id: `mgr-${i}`,
          source: l.manager_id,
          target: l.employee_id,
          type: "smoothstep",
          style: { stroke: "hsl(var(--info))", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--info))" },
        });
      });

      // HR-task edges within team
      hrTasks.forEach((tsk) => {
        tsk.assignees.forEach((a) => {
          if (a.user_id === tsk.created_by) return;
          if (!idSet.has(tsk.created_by) || !idSet.has(a.user_id)) return;
          const color =
            tsk.status === "completed"
              ? "hsl(var(--success))"
              : tsk.status === "in_review"
              ? "hsl(var(--warning))"
              : tsk.status === "rejected" || tsk.status === "cancelled"
              ? "hsl(var(--destructive))"
              : "hsl(var(--primary))";
          edges.push({
            id: `task-${tsk.id}-${a.user_id}`,
            source: tsk.created_by,
            target: a.user_id,
            type: "default",
            animated: tsk.status === "in_review",
            style: { stroke: color, strokeWidth: 1.5, strokeDasharray: "5 4" },
            markerEnd: { type: MarkerType.Arrow, color },
            label: `🎯 ${tsk.title.slice(0, 18)}${tsk.reward_coins ? ` · ${tsk.reward_coins}🪙` : ""}`,
            labelStyle: { fill: "hsl(var(--foreground))", fontSize: 10, fontWeight: 500 },
            labelBgStyle: { fill: "hsl(var(--card))" },
          });
        });
      });

      return { nodes, edges };
    }

    return { nodes, edges };
  }, [
    employees,
    teamLinks,
    hrTasks,
    selectedEmployeeId,
    mapLevel,
    activeDept,
    activeTeamManagerId,
    empById,
    managerToEmployees,
    employeeToManager,
    t,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layouted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layouted.edges);

  // Sync when source data changes
  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layouted, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: any, node: Node) => {
      if (node.id.startsWith("dept:")) {
        setActiveDept(node.id.slice(5));
        setMapLevel("department");
        setSelectedEmployeeId(null);
        return;
      }
      if (node.id.startsWith("team:")) {
        setActiveTeamManagerId(node.id.slice(5));
        setMapLevel("team");
        setSelectedEmployeeId(null);
        return;
      }
      setSelectedEmployeeId(node.id);
    },
    [],
  );


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
      const { data: assignments } = await laravelDb
        .from("employee_career_assignments")
        .select("template_id, current_step, status")
        .eq("user_id", selectedEmployeeId);
      let trackProgress = 0;
      if (assignments && assignments.length > 0) {
        const tplIds = assignments.map((a) => a.template_id);
        const { data: tpls } = await laravelDb
          .from("career_track_templates")
          .select("id, steps")
          .in("id", tplIds);
        const tplMap = new Map<string, number>((tpls || []).map((t: any) => [t.id, (t.steps as any[])?.length || 1]));
        const totals = assignments.map((a) => {
          const total = tplMap.get(a.template_id) ?? 1;
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
      const { count: rewardsCount } = await laravelDb
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
      const { data: orders } = await laravelDb
        .from("shop_orders")
        .select("id, status, total_amount, created_at")
        .eq("user_id", selectedEmployeeId)
        .order("created_at", { ascending: false });
      const orderIds = (orders || []).map((o) => o.id);
      let items: any[] = [];
      if (orderIds.length > 0) {
        const { data: it } = await laravelDb
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
      if (!companyId || !user) throw new Error(t("employeeMap.toasts.noCompany"));
      const { data: task, error } = await laravelDb
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
        const { error: aErr } = await laravelDb.from("hr_task_assignees").insert(
          payload.assigneeIds.map((uid) => ({ task_id: task.id, user_id: uid })),
        );
        if (aErr) throw aErr;
      }
      return task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hrd_map_hr_tasks"] });
      toast.success(t("employeeMap.toasts.created"));
      setCreateTaskOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!user) return;
      const { error } = await laravelDb
        .from("hr_tasks")
        .update({ status: "completed", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hrd_map_hr_tasks"] });
      qc.invalidateQueries({ queryKey: ["hrd_map_balances"] });
      toast.success(t("employeeMap.toasts.confirmed"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rejectTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!user) return;
      const { error } = await laravelDb
        .from("hr_tasks")
        .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hrd_map_hr_tasks"] });
      toast.success(t("employeeMap.toasts.rejected"));
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await laravelDb.from("hr_tasks").delete().eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hrd_map_hr_tasks"] });
      toast.success(t("employeeMap.toasts.deleted"));
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
        <h3 className="font-semibold text-foreground mb-2">{t("employeeMap.noEmployees")}</h3>
        <p className="text-sm text-muted-foreground">{t("employeeMap.inviteHint")}</p>
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
          <h3 className="text-lg font-semibold text-foreground">{t("employeeMap.title")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("employeeMap.subtitle")}
          </p>
        </div>
        <Button
          onClick={() => {
            setTaskFormFromId(user?.id || null);
            setTaskFormToId(selectedEmployeeId);
            setCreateTaskOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" /> {t("employeeMap.newTask")}
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
              {t("employeeMap.clickHint")}
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
                    <TabsTrigger value="overview">{t("employeeMap.tabs.overview")}</TabsTrigger>
                    <TabsTrigger value="tasks">{t("employeeMap.tabs.tasks")}</TabsTrigger>
                    <TabsTrigger value="shop">{t("employeeMap.tabs.shop")}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-3 mt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-secondary/50 rounded-lg p-3">
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> {t("employeeMap.overview.effectiveness")}
                        </div>
                        <div className="text-2xl font-bold text-foreground">{composite?.composite ?? 0}</div>
                      </div>
                      <div className="bg-secondary/50 rounded-lg p-3">
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Coins className="w-3 h-3" /> {t("employeeMap.overview.balance")}
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                          {formatCoins(balanceMap.get(selected.user_id) || 0)}
                        </div>
                      </div>
                    </div>
                    {composite && (
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("employeeMap.overview.trackProgress")}</span>
                          <span className="font-medium">{composite.trackProgress}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("employeeMap.overview.hrTasksDone")}</span>
                          <span className="font-medium">
                            {composite.completedTasks}/{composite.totalTasks} ({composite.taskRatio}%)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("employeeMap.overview.profileScore")}</span>
                          <span className="font-medium">{composite.overall}/100</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("employeeMap.overview.rewards")}</span>
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
                      <Plus className="w-4 h-4 mr-1" /> {t("employeeMap.assignTask")}
                    </Button>
                  </TabsContent>

                  <TabsContent value="tasks" className="space-y-2 mt-3">
                    {selectedTasks.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        {t("employeeMap.tasks.empty")}
                      </p>
                    )}
                    {selectedTasks.map((task) => (
                      <div key={task.id} className="border border-border rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-foreground truncate">{task.title}</div>
                            {task.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                            )}
                          </div>
                          <Badge
                            variant={
                              task.status === "completed"
                                ? "default"
                                : task.status === "in_review"
                                ? "secondary"
                                : task.status === "rejected"
                                ? "destructive"
                                : "outline"
                            }
                            className="shrink-0 text-[10px]"
                          >
                            {t(`employeeMap.tasks.status.${task.status}`, task.status)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Coins className="w-3 h-3" /> {task.reward_coins}
                          </span>
                          {task.deadline && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {new Date(task.deadline).toLocaleDateString(getIntlLocale())}
                            </span>
                          )}
                          <span>· {t("employeeMap.tasks.assigneesShort", { count: task.assignees.length })}</span>
                        </div>
                        {task.status !== "completed" && task.status !== "cancelled" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs flex-1"
                              onClick={() => completeTaskMutation.mutate(task.id)}
                              disabled={completeTaskMutation.isPending}
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              {t("employeeMap.tasks.confirm")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => rejectTaskMutation.mutate(task.id)}
                            >
                              {t("employeeMap.tasks.reject")}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => deleteTaskMutation.mutate(task.id)}
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
                          <ShoppingBag className="w-3 h-3" /> {t("employeeMap.shop.orders")}
                        </div>
                        <div className="text-2xl font-bold text-foreground">{shopActivity?.ordersCount ?? 0}</div>
                      </div>
                      <div className="bg-secondary/50 rounded-lg p-3">
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Coins className="w-3 h-3" /> {t("employeeMap.shop.spent")}
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                          {formatCoins(shopActivity?.totalSpent || 0)}
                        </div>
                      </div>
                    </div>
                    {shopActivity && shopActivity.spendBreakdown.length > 0 ? (
                      <div>
                        <div className="text-xs font-medium text-foreground mb-2">{t("employeeMap.shop.breakdown")}</div>
                        <ResponsiveContainer width="100%" height={180}>
                          <PieChart>
                            <Pie
                              data={shopActivity.spendBreakdown}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={60}
                              label={(e: any) => `${(e?.name as string)?.slice(0, 10) ?? ""}`}
                            >
                              {shopActivity.spendBreakdown.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <RTooltip {...tooltipProps("none")} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        {t("employeeMap.shop.noOrders")}
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

const CATEGORY_VALUES = ["collaboration", "mentorship", "knowledge_sharing", "project", "onboarding"] as const;

const CreateHrTaskDialog = ({
  open,
  onOpenChange,
  employees,
  defaultAssigneeId,
  onSubmit,
  isPending,
}: CreateHrTaskDialogProps) => {
  const { t } = useTranslation("manager");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("collaboration");
  const [reward, setReward] = useState(50);
  const [deadline, setDeadline] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(defaultAssigneeId ? [defaultAssigneeId] : []);

  // Reset on open
  useEffect(() => {
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
      toast.error(t("employeeMap.toasts.needTitle"));
      return;
    }
    if (assigneeIds.length === 0) {
      toast.error(t("employeeMap.toasts.needAssignee"));
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
          <DialogTitle>{t("employeeMap.dialog.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("employeeMap.dialog.name")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("employeeMap.dialog.namePlaceholder")} />
          </div>
          <div>
            <Label>{t("employeeMap.dialog.description")}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{t("employeeMap.dialog.category")}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_VALUES.map((c) => (
                    <SelectItem key={c} value={c}>{t(`employeeMap.categories.${c}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("employeeMap.dialog.reward")}</Label>
              <Input type="number" min={0} value={reward} onChange={(e) => setReward(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label>{t("employeeMap.dialog.deadline")}</Label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div>
            <Label>{t("employeeMap.dialog.assignees", { count: assigneeIds.length })}</Label>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("employeeMap.dialog.cancel")}</Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t("employeeMap.dialog.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HRDEmployeeMap;
