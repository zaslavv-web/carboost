import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useEffectiveUserId } from "@/hooks/useUserProfile";
import { toast } from "sonner";

/* ============ TYPES ============ */
export type GoalStatus = "draft" | "published" | "needs_review" | "archived";
export type TaskStatus =
  | "draft" | "published" | "awaiting_checkin"
  | "done" | "orphan" | "needs_attention" | "archived";
export type TaskUrgency = "critical" | "high" | "medium" | "low";
export type MeetingStatus = "planned" | "done" | "cancelled";

export interface TrackerGoal {
  id: string;
  company_id: string;
  period_id: string | null;
  holder_id: string;
  author_id: string;
  parent_goal_id: string | null;
  team_id: string | null;
  title: string;
  description: string | null;
  status: GoalStatus;
  progress: number;
  needs_review_reason: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrackerKeyResult {
  id: string;
  goal_id: string;
  title: string;
  unit: string;
  weight: number;
  start_value: number;
  current_value: number;
  target_value: number;
  position: number;
}

export interface TrackerTask {
  id: string;
  company_id: string;
  author_id: string;
  assignee_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  urgency: TaskUrgency;
  due_at: string | null;
  jira_key: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrackerTaskGoalLink {
  id: string;
  task_id: string;
  goal_id: string;
  key_result_id: string | null;
  impact_weight: number;
}

export interface TrackerOneOnOne {
  id: string;
  company_id: string;
  manager_id: string;
  employee_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: MeetingStatus;
  notes: string | null;
  summary: string | null;
}

export interface TrackerAgendaItem {
  id: string;
  meeting_id: string;
  title: string;
  notes: string | null;
  position: number;
  linked_task_id: string | null;
  linked_goal_id: string | null;
  is_done: boolean;
}

/* ============ HELPERS ============ */
const handle = <T,>({ data, error }: { data: T | null; error: any }): T => {
  if (error) {
    const msg = error.message || "Ошибка запроса";
    toast.error(msg);
    throw new Error(msg);
  }
  return data as T;
};

/* ============ GOALS ============ */
export function useGoals(filter?: { holder_id?: string; status?: GoalStatus }) {
  return useQuery({
    queryKey: ["tracker.goals", filter],
    queryFn: async () => {
      let q = laravelDb.from("tracker_goals").select("*").order("created_at", { ascending: false });
      if (filter?.holder_id) q = q.eq("holder_id", filter.holder_id);
      if (filter?.status) q = q.eq("status", filter.status);
      const res = await q;
      return handle<TrackerGoal[]>(res as any) ?? [];
    },
  });
}

export function useGoal(goalId?: string) {
  return useQuery({
    queryKey: ["tracker.goal", goalId],
    enabled: !!goalId,
    queryFn: async () => {
      const res = await laravelDb.from("tracker_goals").select("*").eq("id", goalId!).single();
      return handle<TrackerGoal>(res as any);
    },
  });
}

export function useKeyResults(goalId?: string) {
  return useQuery({
    queryKey: ["tracker.kr", goalId],
    enabled: !!goalId,
    queryFn: async () => {
      const res = await laravelDb
        .from("tracker_key_results").select("*")
        .eq("goal_id", goalId!).order("position", { ascending: true });
      return handle<TrackerKeyResult[]>(res as any) ?? [];
    },
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  const uid = useEffectiveUserId();
  return useMutation({
    mutationFn: async (input: Partial<TrackerGoal>) => {
      const res = await laravelDb.from("tracker_goals").insert({
        holder_id: uid,
        ...input,
      }).select("*").single();
      return handle<TrackerGoal>(res as any);
    },
    onSuccess: () => {
      toast.success("Цель создана");
      qc.invalidateQueries({ queryKey: ["tracker.goals"] });
    },
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<TrackerGoal> & { id: string }) => {
      const res = await laravelDb.from("tracker_goals").update(patch).eq("id", id).select("*").single();
      return handle<TrackerGoal>(res as any);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tracker.goals"] });
      qc.invalidateQueries({ queryKey: ["tracker.goal", v.id] });
    },
  });
}

export function useUpsertKeyResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<TrackerKeyResult> & { goal_id: string }) => {
      const op = input.id
        ? laravelDb.from("tracker_key_results").update(input).eq("id", input.id).select("*").single()
        : laravelDb.from("tracker_key_results").insert(input).select("*").single();
      const res = await op;
      return handle<TrackerKeyResult>(res as any);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tracker.kr", v.goal_id] });
      qc.invalidateQueries({ queryKey: ["tracker.goal", v.goal_id] });
      qc.invalidateQueries({ queryKey: ["tracker.goals"] });
    },
  });
}

export function useDeleteKeyResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; goal_id: string }) => {
      const res = await laravelDb.from("tracker_key_results").delete().eq("id", id);
      return handle(res as any);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tracker.kr", v.goal_id] });
      qc.invalidateQueries({ queryKey: ["tracker.goals"] });
    },
  });
}

/* ============ TASKS ============ */
export function useTasks(filter?: { assignee_id?: string; status?: TaskStatus; urgency?: TaskUrgency }) {
  return useQuery({
    queryKey: ["tracker.tasks", filter],
    queryFn: async () => {
      let q = laravelDb.from("tracker_tasks").select("*").order("created_at", { ascending: false });
      if (filter?.assignee_id) q = q.eq("assignee_id", filter.assignee_id);
      if (filter?.status) q = q.eq("status", filter.status);
      if (filter?.urgency) q = q.eq("urgency", filter.urgency);
      const res = await q;
      return handle<TrackerTask[]>(res as any) ?? [];
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const uid = useEffectiveUserId();
  return useMutation({
    mutationFn: async (input: Partial<TrackerTask>) => {
      const res = await laravelDb.from("tracker_tasks").insert({
        assignee_id: uid,
        urgency: "medium",
        status: "published",
        ...input,
      }).select("*").single();
      return handle<TrackerTask>(res as any);
    },
    onSuccess: () => {
      toast.success("Поручение создано");
      qc.invalidateQueries({ queryKey: ["tracker.tasks"] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<TrackerTask> & { id: string }) => {
      const res = await laravelDb.from("tracker_tasks").update(patch).eq("id", id).select("*").single();
      return handle<TrackerTask>(res as any);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tracker.tasks"] }),
  });
}

export function useTaskLinks(taskId?: string) {
  return useQuery({
    queryKey: ["tracker.taskLinks", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const res = await laravelDb.from("tracker_task_goal_links").select("*").eq("task_id", taskId!);
      return handle<TrackerTaskGoalLink[]>(res as any) ?? [];
    },
  });
}

export function useKrTaskLinks(krId?: string) {
  return useQuery({
    queryKey: ["tracker.krLinks", krId],
    enabled: !!krId,
    queryFn: async () => {
      const res = await laravelDb
        .from("tracker_task_goal_links")
        .select("*, task:tracker_tasks(id,title,status,urgency,assignee_id)")
        .eq("key_result_id", krId!);
      return handle<(TrackerTaskGoalLink & { task?: Partial<TrackerTask> })[]>(res as any) ?? [];
    },
  });
}

export function useLinkTaskToGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ task_id, goal_id, key_result_id, impact_weight }: { task_id: string; goal_id: string; key_result_id?: string | null; impact_weight?: number }) => {
      const res = await laravelDb.from("tracker_task_goal_links")
        .insert({ task_id, goal_id, key_result_id: key_result_id ?? null, impact_weight: impact_weight ?? 1 })
        .select("*").single();
      return handle<TrackerTaskGoalLink>(res as any);
    },
    onSuccess: (_d, v) => {
      toast.success("Связь добавлена");
      qc.invalidateQueries({ queryKey: ["tracker.taskLinks", v.task_id] });
      if (v.key_result_id) qc.invalidateQueries({ queryKey: ["tracker.krLinks", v.key_result_id] });
      qc.invalidateQueries({ queryKey: ["tracker.tasks"] });
    },
  });
}

export function useUnlinkTaskFromGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; task_id?: string; key_result_id?: string | null }) => {
      const res = await laravelDb.from("tracker_task_goal_links").delete().eq("id", id);
      return handle(res as any);
    },
    onSuccess: (_d, v) => {
      if (v.task_id) qc.invalidateQueries({ queryKey: ["tracker.taskLinks", v.task_id] });
      if (v.key_result_id) qc.invalidateQueries({ queryKey: ["tracker.krLinks", v.key_result_id] });
    },
  });
}

/* ============ 1:1 ============ */
export function useOneOnOnes(filter?: { manager_id?: string; employee_id?: string }) {
  return useQuery({
    queryKey: ["tracker.1on1", filter],
    queryFn: async () => {
      let q = laravelDb.from("tracker_one_on_ones").select("*").order("scheduled_at", { ascending: false });
      if (filter?.manager_id) q = q.eq("manager_id", filter.manager_id);
      if (filter?.employee_id) q = q.eq("employee_id", filter.employee_id);
      const res = await q;
      return handle<TrackerOneOnOne[]>(res as any) ?? [];
    },
  });
}

export function useCreateOneOnOne() {
  const qc = useQueryClient();
  const uid = useEffectiveUserId();
  return useMutation({
    mutationFn: async (input: Partial<TrackerOneOnOne>) => {
      const res = await laravelDb.from("tracker_one_on_ones").insert({
        manager_id: uid,
        status: "planned",
        duration_minutes: 30,
        ...input,
      }).select("*").single();
      return handle<TrackerOneOnOne>(res as any);
    },
    onSuccess: () => {
      toast.success("Встреча запланирована");
      qc.invalidateQueries({ queryKey: ["tracker.1on1"] });
    },
  });
}

export function useUpdateOneOnOne() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<TrackerOneOnOne> & { id: string }) => {
      const res = await laravelDb.from("tracker_one_on_ones").update(patch).eq("id", id).select("*").single();
      return handle<TrackerOneOnOne>(res as any);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tracker.1on1"] }),
  });
}

export function useAgenda(meetingId?: string) {
  return useQuery({
    queryKey: ["tracker.agenda", meetingId],
    enabled: !!meetingId,
    queryFn: async () => {
      const res = await laravelDb.from("tracker_one_on_one_agenda").select("*")
        .eq("meeting_id", meetingId!).order("position", { ascending: true });
      return handle<TrackerAgendaItem[]>(res as any) ?? [];
    },
  });
}

export function useUpsertAgenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<TrackerAgendaItem> & { meeting_id: string }) => {
      const op = input.id
        ? laravelDb.from("tracker_one_on_one_agenda").update(input).eq("id", input.id).select("*").single()
        : laravelDb.from("tracker_one_on_one_agenda").insert(input).select("*").single();
      const res = await op;
      return handle<TrackerAgendaItem>(res as any);
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["tracker.agenda", v.meeting_id] }),
  });
}

/* ============ STATS ============ */
export function useTrackerStats() {
  const goalsQ = useGoals();
  const tasksQ = useTasks();
  const oneOnOnesQ = useOneOnOnes();

  const goals = goalsQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const meetings = oneOnOnesQ.data ?? [];

  const activeGoals = goals.filter((g) => g.status === "published").length;
  const avgProgress = activeGoals
    ? Math.round(goals.filter((g) => g.status === "published").reduce((s, g) => s + Number(g.progress || 0), 0) / activeGoals)
    : 0;

  const overdueTasks = tasks.filter((t) => t.due_at && new Date(t.due_at) < new Date() && t.status !== "done" && t.status !== "archived").length;
  const needsAttention = tasks.filter((t) => t.status === "needs_attention" || t.status === "orphan").length;

  return {
    isLoading: goalsQ.isLoading || tasksQ.isLoading || oneOnOnesQ.isLoading,
    goalsCount: goals.length,
    activeGoals,
    avgProgress,
    tasksCount: tasks.length,
    overdueTasks,
    needsAttention,
    upcomingMeetings: meetings.filter((m) => m.status === "planned" && new Date(m.scheduled_at) >= new Date()).length,
  };
}
