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

export type TaskType = "epic" | "story" | "task" | "bug" | "subtask";

export interface TrackerProject {
  id: string;
  company_id: string;
  key: string;
  name: string;
  description: string | null;
  lead_id: string | null;
  color: string | null;
  icon: string | null;
  status: "active" | "archived";
  workflow_id: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkflowStatusCategory = "todo" | "in_progress" | "done";

export interface TrackerWorkflow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface TrackerWorkflowStatus {
  id: string;
  workflow_id: string;
  company_id: string;
  key: string;
  name: string;
  category: WorkflowStatusCategory;
  color: string | null;
  position: number;
  is_initial: boolean;
}

export interface TrackerWorkflowTransition {
  id: string;
  workflow_id: string;
  company_id: string;
  from_status_id: string | null;
  to_status_id: string;
  name: string;
}

export interface TrackerTask {
  id: string;
  company_id: string;
  project_id: string | null;
  sprint_id: string | null;
  author_id: string;
  assignee_id: string;
  parent_task_id: string | null;
  type: TaskType;
  title: string;
  description: string | null;
  status: TaskStatus;
  workflow_status_id: string | null;
  urgency: TaskUrgency;
  priority: TaskUrgency | null;
  story_points: number | null;
  estimate_minutes: number | null;
  labels: string[] | null;
  order_index: number;
  due_at: string | null;
  start_at: string | null;
  jira_key: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SprintStatus = "planned" | "active" | "completed";

export interface TrackerSprint {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  start_date: string | null;
  end_date: string | null;
  completed_at: string | null;
  position: number;
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
        .select("*, task(id,title,status,urgency,assignee_id)")
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

/* ============ PROJECTS ============ */
export function useProjects(filter?: { status?: "active" | "archived" }) {
  return useQuery({
    queryKey: ["tracker.projects", filter],
    queryFn: async () => {
      let q = laravelDb.from("tracker_projects").select("*").order("created_at", { ascending: false });
      if (filter?.status) q = q.eq("status", filter.status);
      const res = await q;
      return handle<TrackerProject[]>(res as any) ?? [];
    },
  });
}

export function useProject(projectId?: string) {
  return useQuery({
    queryKey: ["tracker.project", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const res = await laravelDb.from("tracker_projects").select("*").eq("id", projectId!).single();
      return handle<TrackerProject>(res as any);
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<TrackerProject>) => {
      const res = await laravelDb.from("tracker_projects").insert({ status: "active", ...input }).select("*").single();
      return handle<TrackerProject>(res as any);
    },
    onSuccess: () => {
      toast.success("Проект создан");
      qc.invalidateQueries({ queryKey: ["tracker.projects"] });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<TrackerProject> & { id: string }) => {
      const res = await laravelDb.from("tracker_projects").update(patch).eq("id", id).select("*").single();
      return handle<TrackerProject>(res as any);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tracker.projects"] }),
  });
}

/* ============ KANBAN BOARD ============ */
/** Fixed columns until customizable workflows ship (stage 3). */
export const BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "draft", label: "К проработке" },
  { status: "published", label: "В работе" },
  { status: "awaiting_checkin", label: "На проверке" },
  { status: "done", label: "Готово" },
];

export function useBoardTasks(projectId?: string | null) {
  return useQuery({
    queryKey: ["tracker.board", projectId ?? "inbox"],
    queryFn: async () => {
      let q = laravelDb
        .from("tracker_tasks")
        .select("*")
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: false });
      if (projectId) q = q.eq("project_id", projectId);
      else q = q.is("project_id", null);
      const res = await q;
      return handle<TrackerTask[]>(res as any) ?? [];
    },
  });
}

export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, status, workflow_status_id, order_index,
    }: {
      id: string;
      status?: TaskStatus;
      workflow_status_id?: string | null;
      order_index: number;
      projectKey: string;
    }) => {
      const patch: Record<string, any> = { order_index };
      if (status !== undefined) patch.status = status;
      if (workflow_status_id !== undefined) patch.workflow_status_id = workflow_status_id;
      const res = await laravelDb.from("tracker_tasks").update(patch).eq("id", id).select("*").single();
      return handle<TrackerTask>(res as any);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tracker.board", v.projectKey] });
      qc.invalidateQueries({ queryKey: ["tracker.tasks"] });
    },
  });
}

/* ============ WORKFLOWS ============ */
export function useWorkflows() {
  return useQuery({
    queryKey: ["tracker.workflows"],
    queryFn: async () => {
      const res = await laravelDb.from("tracker_workflows").select("*").order("created_at", { ascending: true });
      return handle<TrackerWorkflow[]>(res as any) ?? [];
    },
  });
}

export function useWorkflowStatuses(workflowId?: string | null) {
  return useQuery({
    queryKey: ["tracker.workflow.statuses", workflowId],
    enabled: !!workflowId,
    queryFn: async () => {
      const res = await laravelDb
        .from("tracker_workflow_statuses")
        .select("*")
        .eq("workflow_id", workflowId!)
        .order("position", { ascending: true });
      return handle<TrackerWorkflowStatus[]>(res as any) ?? [];
    },
  });
}

export function useWorkflowTransitions(workflowId?: string | null) {
  return useQuery({
    queryKey: ["tracker.workflow.transitions", workflowId],
    enabled: !!workflowId,
    queryFn: async () => {
      const res = await laravelDb
        .from("tracker_workflow_transitions")
        .select("*")
        .eq("workflow_id", workflowId!);
      return handle<TrackerWorkflowTransition[]>(res as any) ?? [];
    },
  });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<TrackerWorkflow>) => {
      const res = await laravelDb.from("tracker_workflows").insert({ is_default: false, ...input }).select("*").single();
      return handle<TrackerWorkflow>(res as any);
    },
    onSuccess: () => {
      toast.success("Воркфлоу создан");
      qc.invalidateQueries({ queryKey: ["tracker.workflows"] });
    },
  });
}

export function useUpdateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<TrackerWorkflow> & { id: string }) => {
      const res = await laravelDb.from("tracker_workflows").update(patch).eq("id", id).select("*").single();
      return handle<TrackerWorkflow>(res as any);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tracker.workflows"] }),
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await laravelDb.from("tracker_workflows").delete().eq("id", id);
      return handle(res as any);
    },
    onSuccess: () => {
      toast.success("Воркфлоу удалён");
      qc.invalidateQueries({ queryKey: ["tracker.workflows"] });
    },
  });
}

export function useUpsertWorkflowStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<TrackerWorkflowStatus> & { workflow_id: string }) => {
      const op = input.id
        ? laravelDb.from("tracker_workflow_statuses").update(input).eq("id", input.id).select("*").single()
        : laravelDb.from("tracker_workflow_statuses").insert(input).select("*").single();
      const res = await op;
      return handle<TrackerWorkflowStatus>(res as any);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tracker.workflow.statuses", v.workflow_id] });
      qc.invalidateQueries({ queryKey: ["tracker.board"] });
    },
  });
}

export function useDeleteWorkflowStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; workflow_id: string }) => {
      const res = await laravelDb.from("tracker_workflow_statuses").delete().eq("id", id);
      return handle(res as any);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tracker.workflow.statuses", v.workflow_id] });
      qc.invalidateQueries({ queryKey: ["tracker.board"] });
    },
  });
}

export function useUpsertWorkflowTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<TrackerWorkflowTransition> & { workflow_id: string }) => {
      const op = input.id
        ? laravelDb.from("tracker_workflow_transitions").update(input).eq("id", input.id).select("*").single()
        : laravelDb.from("tracker_workflow_transitions").insert(input).select("*").single();
      const res = await op;
      return handle<TrackerWorkflowTransition>(res as any);
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["tracker.workflow.transitions", v.workflow_id] }),
  });
}

export function useDeleteWorkflowTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; workflow_id: string }) => {
      const res = await laravelDb.from("tracker_workflow_transitions").delete().eq("id", id);
      return handle(res as any);
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["tracker.workflow.transitions", v.workflow_id] }),
  });
}

/* ============ SPRINTS (Scrum) ============ */
export function useSprints(projectId?: string | null, status?: SprintStatus) {
  return useQuery({
    queryKey: ["tracker.sprints", projectId ?? null, status ?? null],
    enabled: !!projectId,
    queryFn: async () => {
      let q = laravelDb
        .from("tracker_sprints").select("*")
        .eq("project_id", projectId!)
        .order("position", { ascending: true })
        .order("created_at", { ascending: false });
      if (status) q = q.eq("status", status);
      const res = await q;
      return handle<TrackerSprint[]>(res as any) ?? [];
    },
  });
}

export function useActiveSprint(projectId?: string | null) {
  const q = useSprints(projectId, "active");
  return { ...q, data: (q.data ?? [])[0] ?? null };
}

export function useCreateSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<TrackerSprint> & { project_id: string }) => {
      const res = await laravelDb.from("tracker_sprints")
        .insert({ status: "planned", ...input })
        .select("*").single();
      return handle<TrackerSprint>(res as any);
    },
    onSuccess: (_d, v) => {
      toast.success("Спринт создан");
      qc.invalidateQueries({ queryKey: ["tracker.sprints", v.project_id] });
    },
  });
}

export function useUpdateSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<TrackerSprint> & { id: string }) => {
      const res = await laravelDb.from("tracker_sprints").update(patch).eq("id", id).select("*").single();
      return handle<TrackerSprint>(res as any);
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["tracker.sprints", d.project_id] });
    },
  });
}

export function useDeleteSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; project_id: string }) => {
      const res = await laravelDb.from("tracker_sprints").delete().eq("id", id);
      return handle(res as any);
    },
    onSuccess: (_d, v) => {
      toast.success("Спринт удалён");
      qc.invalidateQueries({ queryKey: ["tracker.sprints", v.project_id] });
      qc.invalidateQueries({ queryKey: ["tracker.backlog", v.project_id] });
    },
  });
}

export function useStartSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, project_id, start_date, end_date }: { id: string; project_id: string; start_date?: string; end_date?: string }) => {
      const res = await laravelDb.from("tracker_sprints").update({
        status: "active",
        start_date: start_date ?? new Date().toISOString(),
        end_date: end_date ?? null,
      }).eq("id", id).select("*").single();
      return handle<TrackerSprint>(res as any);
    },
    onSuccess: (_d, v) => {
      toast.success("Спринт запущен");
      qc.invalidateQueries({ queryKey: ["tracker.sprints", v.project_id] });
    },
  });
}

export function useCompleteSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, project_id, moveUnfinishedToSprintId }: { id: string; project_id: string; moveUnfinishedToSprintId?: string | null }) => {
      // Перенос невыполненных задач: всё что != done в этом спринте → в указанный спринт (или в бэклог)
      const unfinished = await laravelDb.from("tracker_tasks")
        .select("id,status").eq("sprint_id", id).neq("status", "done");
      const list = handle<{ id: string; status: string }[]>(unfinished as any) ?? [];
      if (list.length) {
        await Promise.all(list.map((t) =>
          laravelDb.from("tracker_tasks").update({
            sprint_id: moveUnfinishedToSprintId ?? null,
          }).eq("id", t.id)
        ));
      }
      const res = await laravelDb.from("tracker_sprints").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", id).select("*").single();
      return handle<TrackerSprint>(res as any);
    },
    onSuccess: (_d, v) => {
      toast.success("Спринт завершён");
      qc.invalidateQueries({ queryKey: ["tracker.sprints", v.project_id] });
      qc.invalidateQueries({ queryKey: ["tracker.backlog", v.project_id] });
      qc.invalidateQueries({ queryKey: ["tracker.sprintTasks"] });
    },
  });
}

/* ============ BACKLOG ============ */
export function useBacklog(projectId?: string | null) {
  return useQuery({
    queryKey: ["tracker.backlog", projectId ?? null],
    enabled: !!projectId,
    queryFn: async () => {
      const res = await laravelDb
        .from("tracker_tasks").select("*")
        .eq("project_id", projectId!)
        .is("sprint_id", null)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: false });
      return handle<TrackerTask[]>(res as any) ?? [];
    },
  });
}

export function useSprintTasks(sprintId?: string | null) {
  return useQuery({
    queryKey: ["tracker.sprintTasks", sprintId ?? null],
    enabled: !!sprintId,
    queryFn: async () => {
      const res = await laravelDb
        .from("tracker_tasks").select("*")
        .eq("sprint_id", sprintId!)
        .order("order_index", { ascending: true });
      return handle<TrackerTask[]>(res as any) ?? [];
    },
  });
}

export function useAssignTaskToSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, sprintId }: { taskId: string; sprintId: string | null; projectId: string }) => {
      const res = await laravelDb.from("tracker_tasks").update({ sprint_id: sprintId })
        .eq("id", taskId).select("*").single();
      return handle<TrackerTask>(res as any);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tracker.backlog", v.projectId] });
      qc.invalidateQueries({ queryKey: ["tracker.sprints", v.projectId] });
      qc.invalidateQueries({ queryKey: ["tracker.sprintTasks"] });
      qc.invalidateQueries({ queryKey: ["tracker.board", v.projectId] });
    },
  });
}



