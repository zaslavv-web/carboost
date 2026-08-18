import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Grid3X3, Loader2, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import NineBoxGrid from "@/components/talent/NineBoxGrid";
import { usePrimaryRole } from "@/hooks/useUserProfile";
import {
  POOL_LABELS, READINESS_LABELS,
  talentReviewApi,
  type GridRow, type PoolKind, type Readiness, type RiskLevel, type TalentReviewNote,
} from "@/integrations/laravel/talentReview";

const RISKS: RiskLevel[] = ["low", "medium", "high"];
const RISK_LABEL: Record<RiskLevel, string> = { low: "Низкий", medium: "Средний", high: "Высокий" };

export default function TalentReview() {
  const role = usePrimaryRole();
  const isHr = role === "hr" || role === "hrd" || role === "company_admin" || role === "superadmin";
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string>("");
  const [selected, setSelected] = useState<GridRow | null>(null);

  const sessions = useQuery({ queryKey: ["tr-sessions"], queryFn: talentReviewApi.listSessions });

  useEffect(() => {
    if (!sessionId && sessions.data?.length) setSessionId(sessions.data[0].id);
  }, [sessions.data, sessionId]);

  const grid = useQuery({
    queryKey: ["tr-grid", sessionId],
    queryFn: () => talentReviewApi.grid(sessionId),
    enabled: !!sessionId,
  });

  const saveRating = useMutation({
    mutationFn: (p: { user_id: string; perf_level: number; pot_level: number; flight_risk?: RiskLevel | null; agreed?: boolean; note?: string | null; performance_score?: number | null }) =>
      talentReviewApi.saveRatings(sessionId, [p]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tr-grid", sessionId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const buildPool = useMutation({
    mutationFn: () => talentReviewApi.buildPool(sessionId),
    onSuccess: (r) => {
      toast.success(`В кадровый резерв добавлено: ${r.added}`);
      qc.invalidateQueries({ queryKey: ["tr-pool"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const currentSession = grid.data?.session;

  if (!isHr) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Talent Review</CardTitle>
            <CardDescription>Раздел доступен HR, HRD и администраторам компании.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Talent Review</h1>
          <p className="text-sm text-muted-foreground">
            Калибровка 9-box / 12-box, протоколы сессий, преемственность и кадровый резерв
          </p>
        </div>
        <NewSessionDialog />
      </header>

      <Tabs defaultValue="matrix" className="space-y-4">
        <TabsList>
          <TabsTrigger value="matrix"><Grid3X3 className="mr-1.5 h-4 w-4" />Матрица</TabsTrigger>
          <TabsTrigger value="protocol">Протокол</TabsTrigger>
          <TabsTrigger value="succession">Преемственность</TabsTrigger>
          <TabsTrigger value="pool"><Users className="mr-1.5 h-4 w-4" />Кадровый резерв</TabsTrigger>
        </TabsList>

        {/* ---------- Матрица ---------- */}
        <TabsContent value="matrix" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger className="w-full sm:w-[320px]">
                <SelectValue placeholder="Выберите сессию" />
              </SelectTrigger>
              <SelectContent>
                {(sessions.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} · {s.grid_type === "12box" ? "12-box" : "9-box"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentSession && (
              <>
                <Badge variant="secondary">{currentSession.status}</Badge>
                <Button size="sm" variant="outline" onClick={() => buildPool.mutate()} disabled={buildPool.isPending}>
                  <Sparkles className="mr-1.5 h-4 w-4" />Сформировать резерв
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await talentReviewApi.updateSession(sessionId, { status: "completed" });
                    qc.invalidateQueries({ queryKey: ["tr-sessions"] });
                    qc.invalidateQueries({ queryKey: ["tr-grid", sessionId] });
                    toast.success("Сессия завершена");
                  }}
                >
                  Завершить сессию
                </Button>
              </>
            )}
          </div>

          {!sessionId && <EmptyHint text="Создайте сессию Talent Review, чтобы начать калибровку." />}
          {grid.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
          {grid.data && (
            <>
              <NineBoxGrid
                rows={grid.data.rows}
                cols={grid.data.cols}
                readOnly={currentSession?.status === "completed"}
                onSelect={setSelected}
                onMove={(user_id, perf_level, pot_level) => {
                  const row = grid.data!.rows.find((r) => r.user_id === user_id);
                  saveRating.mutate({
                    user_id, perf_level, pot_level,
                    performance_score: row?.performance_score ?? null,
                    flight_risk: row?.flight_risk ?? null,
                    agreed: row?.agreed ?? false,
                    note: row?.note ?? null,
                  });
                }}
              />
              <p className="text-xs text-muted-foreground">
                Перетащите сотрудника в нужный бокс, чтобы изменить оценку. Клик — карточка калибровки.
              </p>
            </>
          )}

          <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
            <DialogContent>
              {selected && (
                <>
                  <DialogHeader>
                    <DialogTitle>{selected.full_name}</DialogTitle>
                    <DialogDescription>{selected.position ?? "Должность не указана"}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Performance score: {selected.performance_score?.toFixed(2) ?? "—"}
                    </p>
                    <div className="space-y-1.5">
                      <Label>Риск ухода</Label>
                      <Select
                        value={selected.flight_risk ?? "low"}
                        onValueChange={(v) => setSelected({ ...selected, flight_risk: v as RiskLevel })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RISKS.map((r) => <SelectItem key={r} value={r}>{RISK_LABEL[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Комментарий калибровки</Label>
                      <Textarea
                        value={selected.note ?? ""}
                        onChange={(e) => setSelected({ ...selected, note: e.target.value })}
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter className="gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        saveRating.mutate({ ...selected, agreed: true });
                        setSelected(null);
                      }}
                    >
                      Согласовать
                    </Button>
                    <Button
                      onClick={() => {
                        saveRating.mutate({ ...selected });
                        setSelected(null);
                      }}
                    >
                      Сохранить
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ---------- Протокол ---------- */}
        <TabsContent value="protocol">
          {sessionId ? <ProtocolPanel sessionId={sessionId} people={grid.data?.rows ?? []} />
            : <EmptyHint text="Выберите сессию во вкладке «Матрица»." />}
        </TabsContent>

        {/* ---------- Преемственность ---------- */}
        <TabsContent value="succession">
          <SuccessionPanel people={grid.data?.rows ?? []} />
        </TabsContent>

        {/* ---------- Кадровый резерв ---------- */}
        <TabsContent value="pool">
          <PoolPanel people={grid.data?.rows ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const EmptyHint = ({ text }: { text: string }) => (
  <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{text}</CardContent></Card>
);

function NewSessionDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [gridType, setGridType] = useState<"9box" | "12box">("9box");
  const [department, setDepartment] = useState("");

  const create = useMutation({
    mutationFn: () =>
      talentReviewApi.createSession({
        title,
        grid_type: gridType,
        department: department || null,
      }),
    onSuccess: () => {
      toast.success("Сессия создана");
      setOpen(false);
      setTitle("");
      qc.invalidateQueries({ queryKey: ["tr-sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1.5 h-4 w-4" />Новая сессия</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Сессия Talent Review</DialogTitle>
          <DialogDescription>Калибровка сотрудников по матрице Performance × Potential.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Talent Review H2 2026" />
          </div>
          <div className="space-y-1.5">
            <Label>Матрица</Label>
            <Select value={gridType} onValueChange={(v) => setGridType(v as "9box" | "12box")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="9box">9-box (3×3)</SelectItem>
                <SelectItem value="12box">12-box (4×3)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Подразделение (необязательно)</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Все сотрудники" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProtocolPanel({ sessionId, people }: { sessionId: string; people: GridRow[] }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<TalentReviewNote["kind"]>("decision");
  const [subject, setSubject] = useState<string>("none");

  const notes = useQuery({ queryKey: ["tr-notes", sessionId], queryFn: () => talentReviewApi.listNotes(sessionId) });
  const add = useMutation({
    mutationFn: () =>
      talentReviewApi.createNote(sessionId, {
        body, kind, subject_id: subject === "none" ? null : subject,
      }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["tr-notes", sessionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => talentReviewApi.deleteNote(sessionId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tr-notes", sessionId] }),
  });

  const KIND_LABEL = { note: "Заметка", decision: "Решение", action: "Задача" } as const;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader><CardTitle className="text-base">Протокол сессии</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(notes.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Записей пока нет.</p>
          )}
          {(notes.data ?? []).map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={n.kind === "decision" ? "default" : "secondary"}>{KIND_LABEL[n.kind]}</Badge>
                  {n.subject_name && <span className="text-xs text-muted-foreground">{n.subject_name}</span>}
                </div>
                <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove.mutate(n.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Добавить запись</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={kind} onValueChange={(v) => setKind(v as TalentReviewNote["kind"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="decision">Решение</SelectItem>
              <SelectItem value="note">Заметка</SelectItem>
              <SelectItem value="action">Задача</SelectItem>
            </SelectContent>
          </Select>
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger><SelectValue placeholder="Сотрудник" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Без привязки</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>{p.full_name ?? p.user_id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Текст решения..." />
          <Button className="w-full" disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>
            Добавить
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SuccessionPanel({ people }: { people: GridRow[] }) {
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ["tr-plans"], queryFn: talentReviewApi.listPlans });
  const [title, setTitle] = useState("");
  const [candidate, setCandidate] = useState<Record<string, string>>({});

  const createPlan = useMutation({
    mutationFn: () => talentReviewApi.createPlan({ position_title: title }),
    onSuccess: () => { setTitle(""); qc.invalidateQueries({ queryKey: ["tr-plans"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const addCandidate = useMutation({
    mutationFn: (p: { planId: string; user_id: string; readiness: Readiness }) =>
      talentReviewApi.addCandidate(p.planId, { user_id: p.user_id, readiness: p.readiness }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tr-plans"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const removeCandidate = useMutation({
    mutationFn: (p: { planId: string; id: string }) => talentReviewApi.removeCandidate(p.planId, p.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tr-plans"] }),
  });
  const removePlan = useMutation({
    mutationFn: (id: string) => talentReviewApi.deletePlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tr-plans"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          className="w-full sm:w-[320px]"
          placeholder="Критичная должность, напр. Руководитель отдела продаж"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button disabled={!title.trim() || createPlan.isPending} onClick={() => createPlan.mutate()}>
          <Plus className="mr-1.5 h-4 w-4" />Добавить позицию
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(plans.data ?? []).map((plan) => (
          <Card key={plan.id}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{plan.position_title}</CardTitle>
                <CardDescription>
                  {plan.incumbent_name ? `Текущий: ${plan.incumbent_name}` : "Преемники"} ·
                  {" "}риск ухода: {RISK_LABEL[plan.risk_of_loss]}
                </CardDescription>
              </div>
              <Button size="icon" variant="ghost" onClick={() => removePlan.mutate(plan.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {plan.candidates.length === 0 && (
                <p className="text-sm text-muted-foreground">Преемники не назначены.</p>
              )}
              {plan.candidates.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.full_name ?? c.user_id}</p>
                    <p className="text-xs text-muted-foreground">{c.position ?? "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={c.readiness}
                      onValueChange={(v) =>
                        addCandidate.mutate({ planId: plan.id, user_id: c.user_id, readiness: v as Readiness })
                      }
                    >
                      <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(READINESS_LABELS) as Readiness[]).map((r) => (
                          <SelectItem key={r} value={r}>{READINESS_LABELS[r]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" onClick={() => removeCandidate.mutate({ planId: plan.id, id: c.id })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Select
                  value={candidate[plan.id] ?? ""}
                  onValueChange={(v) => setCandidate((s) => ({ ...s, [plan.id]: v }))}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="Выбрать преемника" /></SelectTrigger>
                  <SelectContent>
                    {people.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>{p.full_name ?? p.user_id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  disabled={!candidate[plan.id]}
                  onClick={() =>
                    addCandidate.mutate({ planId: plan.id, user_id: candidate[plan.id], readiness: "1_2_years" })
                  }
                >
                  Добавить
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {(plans.data ?? []).length === 0 && <EmptyHint text="Добавьте критичные должности для карты преемственности." />}
    </div>
  );
}

function PoolPanel({ people }: { people: GridRow[] }) {
  const qc = useQueryClient();
  const pool = useQuery({ queryKey: ["tr-pool"], queryFn: talentReviewApi.listPool });
  const [user, setUser] = useState("");
  const [kind, setKind] = useState<PoolKind>("hipo");

  const add = useMutation({
    mutationFn: () => talentReviewApi.addPoolMember({ user_id: user, pool: kind }),
    onSuccess: () => { setUser(""); qc.invalidateQueries({ queryKey: ["tr-pool"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => talentReviewApi.removePoolMember(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tr-pool"] }),
  });

  const grouped = useMemo(() => {
    const map: Record<string, typeof pool.data> = {};
    (pool.data ?? []).forEach((m) => {
      map[m.pool] = [...(map[m.pool] ?? []), m];
    });
    return map;
  }, [pool.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={user} onValueChange={setUser}>
          <SelectTrigger className="w-full sm:w-[260px]"><SelectValue placeholder="Сотрудник" /></SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.user_id} value={p.user_id}>{p.full_name ?? p.user_id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(v) => setKind(v as PoolKind)}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(POOL_LABELS) as PoolKind[]).map((p) => (
              <SelectItem key={p} value={p}>{POOL_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={!user || add.isPending} onClick={() => add.mutate()}>
          <Plus className="mr-1.5 h-4 w-4" />В резерв
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(POOL_LABELS) as PoolKind[]).map((p) => (
          <Card key={p}>
            <CardHeader>
              <CardTitle className="text-base">{POOL_LABELS[p]}</CardTitle>
              <CardDescription>{grouped[p]?.length ?? 0} чел.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(grouped[p] ?? []).map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.full_name ?? m.user_id}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.position ?? "—"} {m.source === "auto" && "· авто"}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove.mutate(m.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {(grouped[p] ?? []).length === 0 && <p className="text-sm text-muted-foreground">Пусто.</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
