import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Rocket, Plus, Trash2, Users, ClipboardList, CheckCircle2, Clock, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Plan = {
  id: string;
  title: string;
  description?: string;
  duration_days: number;
  target_role?: string;
  position_id?: string | null;
  department_id?: string | null;
  is_active: boolean;
  auto_assign: boolean;
};

type Step = {
  id: string;
  plan_id: string;
  title: string;
  description?: string;
  step_type: string;
  responsible: string;
  stage: string;
  order_index: number;
  due_offset_days: number;
  is_required: boolean;
};

type Assignment = {
  id: string;
  user_id: string;
  plan_id: string;
  buddy_id?: string | null;
  manager_id?: string | null;
  start_date: string;
  expected_end_date?: string | null;
  status: string;
  progress_percent: number;
};

const STAGES = [
  { value: "pre_day1", label: "До 1-го дня" },
  { value: "first_day", label: "Первый день" },
  { value: "first_week", label: "Первая неделя" },
  { value: "first_month", label: "Первый месяц" },
  { value: "probation", label: "Испытательный срок" },
  { value: "custom", label: "Иное" },
];

const STEP_TYPES = [
  { value: "task", label: "Задача" },
  { value: "document", label: "Документ" },
  { value: "training", label: "Обучение" },
  { value: "meeting", label: "Встреча" },
  { value: "checklist", label: "Чек-лист" },
  { value: "access", label: "Доступы/оборудование" },
];

const RESPONSIBLES = [
  { value: "employee", label: "Сотрудник" },
  { value: "manager", label: "Руководитель" },
  { value: "buddy", label: "Бадди" },
  { value: "hr", label: "HR" },
];

const AdaptationPlans = () => {
  const { data: profile } = useUserProfile();
  const companyId = profile?.company_id;
  const qc = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [newAssignOpen, setNewAssignOpen] = useState(false);

  const plansQ = useQuery({
    queryKey: ["onboarding_plans", companyId],
    queryFn: async () => {
      const { data, error } = await laravelDb.from("onboarding_plans" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
    enabled: !!companyId,
  });

  const stepsQ = useQuery({
    queryKey: ["onboarding_plan_steps", selectedPlan],
    queryFn: async () => {
      if (!selectedPlan) return [];
      const { data, error } = await laravelDb.from("onboarding_plan_steps" as any).select("*").eq("plan_id", selectedPlan).order("order_index");
      if (error) throw error;
      return (data ?? []) as Step[];
    },
    enabled: !!selectedPlan,
  });

  const assignmentsQ = useQuery({
    queryKey: ["onboarding_assignments", companyId],
    queryFn: async () => {
      const { data, error } = await laravelDb.from("onboarding_assignments" as any).select("*").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Assignment[];
    },
    enabled: !!companyId,
  });

  const employeesQ = useQuery({
    queryKey: ["profiles_min", companyId],
    queryFn: async () => {
      const { data, error } = await laravelDb.from("profiles").select("id,user_id,first_name,last_name,email").eq("company_id", companyId!);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const createPlan = useMutation({
    mutationFn: async (patch: Partial<Plan>) => {
      const { data, error } = await laravelDb.from("onboarding_plans" as any).insert({ company_id: companyId, is_active: true, duration_days: 90, ...patch }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row: any) => {
      toast.success("План создан");
      setNewPlanOpen(false);
      setSelectedPlan(row.id);
      qc.invalidateQueries({ queryKey: ["onboarding_plans"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Ошибка"),
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("onboarding_plans" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Удалено");
      setSelectedPlan(null);
      qc.invalidateQueries({ queryKey: ["onboarding_plans"] });
    },
  });

  const addStep = useMutation({
    mutationFn: async (patch: Partial<Step>) => {
      const nextOrder = (stepsQ.data?.length ?? 0) + 1;
      const { error } = await laravelDb.from("onboarding_plan_steps" as any).insert({
        company_id: companyId,
        plan_id: selectedPlan,
        order_index: nextOrder,
        stage: "first_week",
        step_type: "task",
        responsible: "employee",
        due_offset_days: 0,
        is_required: true,
        ...patch,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding_plan_steps", selectedPlan] }),
    onError: (e: any) => toast.error(e.message ?? "Ошибка"),
  });

  const removeStep = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("onboarding_plan_steps" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding_plan_steps", selectedPlan] }),
  });

  const createAssignment = useMutation({
    mutationFn: async (patch: Partial<Assignment> & { plan_id: string; user_id: string; start_date: string }) => {
      const plan = plansQ.data?.find((p) => p.id === patch.plan_id);
      const start = new Date(patch.start_date);
      const end = new Date(start);
      end.setDate(end.getDate() + (plan?.duration_days ?? 90));
      const { error } = await laravelDb.from("onboarding_assignments" as any).insert({
        company_id: companyId,
        status: "in_progress",
        progress_percent: 0,
        expected_end_date: end.toISOString().slice(0, 10),
        ...patch,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Сотрудник назначен");
      setNewAssignOpen(false);
      qc.invalidateQueries({ queryKey: ["onboarding_assignments"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Ошибка"),
  });

  const employees = employeesQ.data ?? [];
  const employeeLabel = (uid: string) => {
    const e = employees.find((x) => x.user_id === uid || x.id === uid);
    if (!e) return uid.slice(0, 8);
    return `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || e.email;
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Rocket className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Планы адаптации</h1>
          <p className="text-muted-foreground text-sm">Треки онбординга, назначение бадди, чек-листы и прогресс сотрудников</p>
        </div>
      </div>

      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans"><ClipboardList className="w-4 h-4 mr-2" />Шаблоны планов</TabsTrigger>
          <TabsTrigger value="assignments"><Users className="w-4 h-4 mr-2" />Назначения</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1 bg-card border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Шаблоны</h3>
                <Dialog open={newPlanOpen} onOpenChange={setNewPlanOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><Plus className="w-4 h-4" /></Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Новый шаблон адаптации</DialogTitle></DialogHeader>
                    <NewPlanForm onSubmit={(v) => createPlan.mutate(v)} loading={createPlan.isPending} />
                  </DialogContent>
                </Dialog>
              </div>
              {plansQ.data?.length === 0 && <p className="text-sm text-muted-foreground">Нет шаблонов. Создайте первый.</p>}
              {plansQ.data?.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlan(p.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedPlan === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{p.title}</p>
                    {p.is_active ? <Badge variant="outline" className="text-xs">Активен</Badge> : <Badge variant="secondary" className="text-xs">Черновик</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{p.duration_days} дней{p.target_role ? ` • ${p.target_role}` : ""}</p>
                </button>
              ))}
            </div>

            <div className="md:col-span-2 bg-card border border-border rounded-xl p-4">
              {!selectedPlan && (
                <div className="text-center py-16 text-muted-foreground text-sm">Выберите шаблон слева, чтобы редактировать его шаги</div>
              )}
              {selectedPlan && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Шаги плана</h3>
                    <Button size="sm" variant="ghost" onClick={() => deletePlan.mutate(selectedPlan)}>
                      <Trash2 className="w-4 h-4 mr-1" /> Удалить план
                    </Button>
                  </div>
                  <div className="space-y-2 mb-4">
                    {stepsQ.data?.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{s.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {STAGES.find((x) => x.value === s.stage)?.label} • {STEP_TYPES.find((x) => x.value === s.step_type)?.label} • {RESPONSIBLES.find((x) => x.value === s.responsible)?.label} • +{s.due_offset_days} дн.
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeStep.mutate(s.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    {stepsQ.data?.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Пока нет шагов</p>}
                  </div>
                  <NewStepForm onSubmit={(v) => addStep.mutate(v)} loading={addStep.isPending} />
                </>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Назначенные адаптации</h3>
              <Dialog open={newAssignOpen} onOpenChange={setNewAssignOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Назначить</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Назначить адаптацию</DialogTitle></DialogHeader>
                  <NewAssignmentForm
                    plans={plansQ.data ?? []}
                    employees={employees}
                    onSubmit={(v) => createAssignment.mutate(v)}
                    loading={createAssignment.isPending}
                  />
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-2">
              {assignmentsQ.data?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Нет активных назначений</p>}
              {assignmentsQ.data?.map((a) => {
                const plan = plansQ.data?.find((p) => p.id === a.plan_id);
                return (
                  <div key={a.id} className="p-3 rounded-lg border border-border flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{employeeLabel(a.user_id)}</p>
                      <p className="text-xs text-muted-foreground">
                        {plan?.title ?? "—"} • старт {a.start_date}
                        {a.buddy_id ? ` • бадди: ${employeeLabel(a.buddy_id)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.status === "completed" ? (
                        <Badge className="bg-success/10 text-success"><CheckCircle2 className="w-3 h-3 mr-1" />Завершено</Badge>
                      ) : (
                        <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />{a.progress_percent}%</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const NewPlanForm = ({ onSubmit, loading }: { onSubmit: (v: any) => void; loading: boolean }) => {
  const [v, setV] = useState({ title: "", description: "", duration_days: 90, target_role: "employee" });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.title.trim()) return;
        onSubmit(v);
      }}
    >
      <div><Label>Название</Label><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
      <div><Label>Описание</Label><Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Длительность (дн.)</Label><Input type="number" value={v.duration_days} onChange={(e) => setV({ ...v, duration_days: Number(e.target.value) })} /></div>
        <div>
          <Label>Для кого</Label>
          <Select value={v.target_role} onValueChange={(x) => setV({ ...v, target_role: x })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="employee">Сотрудник</SelectItem>
              <SelectItem value="manager">Руководитель</SelectItem>
              <SelectItem value="hrd">HRD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter><Button type="submit" disabled={loading}>Создать</Button></DialogFooter>
    </form>
  );
};

const NewStepForm = ({ onSubmit, loading }: { onSubmit: (v: any) => void; loading: boolean }) => {
  const [v, setV] = useState({ title: "", stage: "first_week", step_type: "task", responsible: "employee", due_offset_days: 0 });
  return (
    <form
      className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 rounded-lg border border-dashed border-border"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.title.trim()) return;
        onSubmit(v);
        setV({ ...v, title: "" });
      }}
    >
      <Input className="md:col-span-2" placeholder="Название шага" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
      <Select value={v.stage} onValueChange={(x) => setV({ ...v, stage: x })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={v.step_type} onValueChange={(x) => setV({ ...v, step_type: x })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{STEP_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={v.responsible} onValueChange={(x) => setV({ ...v, responsible: x })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{RESPONSIBLES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
      </Select>
      <Button type="submit" disabled={loading}><Plus className="w-4 h-4" /></Button>
    </form>
  );
};

const NewAssignmentForm = ({
  plans, employees, onSubmit, loading,
}: { plans: Plan[]; employees: any[]; onSubmit: (v: any) => void; loading: boolean }) => {
  const [v, setV] = useState({ user_id: "", plan_id: "", buddy_id: "", manager_id: "", start_date: new Date().toISOString().slice(0, 10) });
  const employeeOptions = employees.map((e) => ({ value: e.user_id ?? e.id, label: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || e.email }));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!v.user_id || !v.plan_id) return; onSubmit({ ...v, buddy_id: v.buddy_id || null, manager_id: v.manager_id || null }); }}>
      <div>
        <Label>Сотрудник</Label>
        <Select value={v.user_id} onValueChange={(x) => setV({ ...v, user_id: x })}>
          <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
          <SelectContent>{employeeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>План адаптации</Label>
        <Select value={v.plan_id} onValueChange={(x) => setV({ ...v, plan_id: x })}>
          <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
          <SelectContent>{plans.filter((p) => p.is_active).map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Бадди (наставник)</Label>
          <Select value={v.buddy_id} onValueChange={(x) => setV({ ...v, buddy_id: x })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{employeeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Руководитель</Label>
          <Select value={v.manager_id} onValueChange={(x) => setV({ ...v, manager_id: x })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{employeeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Дата старта</Label>
        <Input type="date" value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value })} />
      </div>
      <DialogFooter><Button type="submit" disabled={loading}>Назначить</Button></DialogFooter>
    </form>
  );
};

export default AdaptationPlans;
