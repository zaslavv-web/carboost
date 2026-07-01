import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Target, Plus, Trash2, CheckCircle2, Clock, BookOpen, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Idp = {
  id: string;
  user_id: string;
  title: string;
  summary?: string;
  period?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  status: "draft" | "active" | "completed" | "archived";
};

type IdpItem = {
  id: string;
  idp_id: string;
  order_index: number;
  kind: "course" | "book" | "mentorship" | "project" | "certification" | "custom";
  title: string;
  description?: string;
  due_date?: string | null;
  status: "planned" | "in_progress" | "done" | "skipped";
  result_note?: string;
};

const KIND_LABEL: Record<IdpItem["kind"], string> = {
  course: "Курс",
  book: "Книга",
  mentorship: "Наставничество",
  project: "Проект",
  certification: "Сертификация",
  custom: "Другое",
};

const STATUS_LABEL: Record<IdpItem["status"], string> = {
  planned: "В плане",
  in_progress: "В работе",
  done: "Выполнено",
  skipped: "Пропущено",
};

export default function IndividualDevelopmentPlans() {
  const { profile } = useUserProfile();
  const companyId = profile?.company_id ?? null;
  const userId = profile?.user_id ?? null;
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);

  const { data: plans = [] } = useQuery({
    queryKey: ["idps", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("individual_development_plans" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[] as Idp[]) ?? [];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["idp-items", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("idp_items" as any)
        .select("*")
        .eq("idp_id", selected!)
        .order("order_index");
      if (error) throw error;
      return (data as any[] as IdpItem[]) ?? [];
    },
  });

  const createIdp = useMutation({
    mutationFn: async (patch: Partial<Idp>) => {
      const { data, error } = await laravelDb
        .from("individual_development_plans" as any)
        .insert({ company_id: companyId, user_id: userId, status: "draft", ...patch })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Idp;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["idps"] });
      setSelected(row.id);
      setCreateOpen(false);
      toast.success("ИПР создан");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось создать ИПР"),
  });

  const removeIdp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("individual_development_plans" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["idps"] });
      setSelected(null);
    },
  });

  const addItem = useMutation({
    mutationFn: async (patch: Partial<IdpItem>) => {
      const { error } = await laravelDb.from("idp_items" as any).insert({
        company_id: companyId,
        idp_id: selected,
        order_index: items.length,
        kind: "course",
        status: "planned",
        ...patch,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["idp-items", selected] });
      setItemOpen(false);
      toast.success("Добавлено");
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<IdpItem> }) => {
      const { error } = await laravelDb.from("idp_items" as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["idp-items", selected] }),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("idp_items" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["idp-items", selected] }),
  });

  const currentPlan = useMemo(() => plans.find((p) => p.id === selected) ?? null, [plans, selected]);
  const progress = useMemo(() => {
    if (!items.length) return 0;
    const done = items.filter((i) => i.status === "done").length;
    return Math.round((done / items.length) * 100);
  }, [items]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Target className="w-6 h-6 text-primary" />
            Индивидуальный план развития
          </h1>
          <p className="text-sm text-muted-foreground">Личные цели развития, курсы, менторство и сертификации</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Новый ИПР</Button>
          </DialogTrigger>
          <IdpCreateDialog onSubmit={(v) => createIdp.mutate(v)} />
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Мои планы</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {plans.length === 0 && <p className="text-sm text-muted-foreground">Пока нет планов развития</p>}
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${selected === p.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.title}</span>
                  <Badge variant="outline">{p.status}</Badge>
                </div>
                {p.period && <p className="text-xs text-muted-foreground mt-1">{p.period}</p>}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {currentPlan ? currentPlan.title : "Выберите план"}
            </CardTitle>
            {currentPlan && (
              <div className="flex gap-2 items-center">
                <span className="text-xs text-muted-foreground">{progress}% выполнено</span>
                <Dialog open={itemOpen} onOpenChange={setItemOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-1" />Активность</Button>
                  </DialogTrigger>
                  <IdpItemDialog onSubmit={(v) => addItem.mutate(v)} />
                </Dialog>
                <Button size="sm" variant="ghost" onClick={() => removeIdp.mutate(currentPlan.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {currentPlan && items.length === 0 && (
              <p className="text-sm text-muted-foreground">Добавьте активности в план развития</p>
            )}
            {items.map((it) => (
              <div key={it.id} className="flex items-start gap-3 p-3 rounded-lg border">
                <div className="p-2 rounded bg-muted">
                  {it.kind === "course" ? <GraduationCap className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{it.title}</span>
                    <Badge variant="outline">{KIND_LABEL[it.kind]}</Badge>
                  </div>
                  {it.description && <p className="text-sm text-muted-foreground mt-1">{it.description}</p>}
                  {it.due_date && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> до {new Date(it.due_date).toLocaleDateString("ru-RU")}
                    </p>
                  )}
                </div>
                <Select value={it.status} onValueChange={(v) => updateItem.mutate({ id: it.id, patch: { status: v as IdpItem["status"] } })}>
                  <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" onClick={() => removeItem.mutate(it.id)}>
                  {it.status === "done" ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function IdpCreateDialog({ onSubmit }: { onSubmit: (v: Partial<Idp>) => void }) {
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState("");
  const [summary, setSummary] = useState("");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Новый ИПР</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Название</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label>Период</Label><Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="H1 2026" /></div>
        <div><Label>Цель развития</Label><Textarea value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button disabled={!title.trim()} onClick={() => onSubmit({ title, period, summary })}>Создать</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function IdpItemDialog({ onSubmit }: { onSubmit: (v: Partial<IdpItem>) => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<IdpItem["kind"]>("course");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Активность плана развития</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Название</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div>
          <Label>Тип</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as IdpItem["kind"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(KIND_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Описание</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div><Label>Срок</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button disabled={!title.trim()} onClick={() => onSubmit({ title, kind, description, due_date: dueDate || null })}>
          Добавить
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
