import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Plus, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";

type Comp = {
  id: string;
  user_id: string;
  company_id: string;
  skill_name: string;
  skill_value: number;
  target_value?: number | null;
  category?: string | null;
};

type Profile = {
  user_id: string;
  full_name?: string | null;
  position?: string | null;
  department?: string | null;
};

const cellColor = (v: number, t: number | null | undefined) => {
  if (!t) return "bg-muted/40";
  const gap = t - v;
  if (gap <= 0) return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300";
  if (gap <= 15) return "bg-amber-500/20 text-amber-700 dark:text-amber-300";
  return "bg-rose-500/20 text-rose-700 dark:text-rose-300";
};

export default function SkillsMatrix() {
  const { data: profile } = useUserProfile();
  const companyId = profile?.company_id ?? null;
  const qc = useQueryClient();
  const [category, setCategory] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);

  const { data: comps = [] } = useQuery({
    queryKey: ["skills-matrix", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await laravelDb.from("competencies" as any).select("*");
      if (error) throw error;
      return (data as any[] as Comp[]) ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["skills-matrix-profiles", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("profiles")
        .select("user_id, full_name, position, department");
      if (error) throw error;
      return (data as any[] as Profile[]) ?? [];
    },
  });

  const categories = useMemo(
    () => Array.from(new Set(comps.map((c) => c.category).filter(Boolean))) as string[],
    [comps]
  );

  const filtered = useMemo(
    () => (category === "all" ? comps : comps.filter((c) => c.category === category)),
    [comps, category]
  );

  const skills = useMemo(
    () => Array.from(new Set(filtered.map((c) => c.skill_name))).sort(),
    [filtered]
  );

  const byUser = useMemo(() => {
    const m = new Map<string, Map<string, Comp>>();
    for (const c of filtered) {
      if (!m.has(c.user_id)) m.set(c.user_id, new Map());
      m.get(c.user_id)!.set(c.skill_name, c);
    }
    return m;
  }, [filtered]);

  const targets = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of filtered) if (c.target_value) m.set(c.skill_name, Math.max(m.get(c.skill_name) ?? 0, c.target_value));
    return m;
  }, [filtered]);

  const avgGap = useMemo(() => {
    const gaps: number[] = [];
    for (const [, sk] of byUser) {
      for (const skill of skills) {
        const c = sk.get(skill);
        const t = targets.get(skill);
        if (t && c) gaps.push(Math.max(0, t - c.skill_value));
      }
    }
    return gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
  }, [byUser, skills, targets]);

  const addComp = useMutation({
    mutationFn: async (payload: {
      user_id: string;
      skill_name: string;
      skill_value: number;
      target_value?: number;
      category?: string;
    }) => {
      const { error } = await laravelDb.from("competencies" as any).insert({
        company_id: companyId,
        ...payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills-matrix"] });
      setAddOpen(false);
      toast.success("Компетенция добавлена");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось сохранить"),
  });

  const rows = Array.from(byUser.entries()).map(([uid, sk]) => {
    const p = profiles.find((x) => x.user_id === uid);
    return { user_id: uid, name: p?.full_name || uid.slice(0, 8), position: p?.position, skills: sk };
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Матрица компетенций
          </h1>
          <p className="text-sm text-muted-foreground">
            Текущий уровень vs целевой по сотрудникам и навыкам
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Категория" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все категории</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Добавить</Button>
            </DialogTrigger>
            <AddCompetencyDialog profiles={profiles} onSave={(p) => addComp.mutate(p)} />
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Сотрудников с записями</div>
          <div className="text-2xl font-semibold">{byUser.size}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Уникальных навыков</div>
          <div className="text-2xl font-semibold">{skills.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Средний gap до цели</div>
          <div className="text-2xl font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />{avgGap}
          </div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Тепловая карта</CardTitle></CardHeader>
        <CardContent className="overflow-auto">
          {rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Пока нет данных. Добавьте компетенции сотрудников.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background">Сотрудник</TableHead>
                  {skills.map((s) => (
                    <TableHead key={s} className="text-center min-w-24">
                      <div className="font-medium">{s}</div>
                      {targets.get(s) && (
                        <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                          <Target className="w-3 h-3" />{targets.get(s)}
                        </div>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="sticky left-0 bg-background">
                      <div className="font-medium">{r.name}</div>
                      {r.position && <div className="text-xs text-muted-foreground">{r.position}</div>}
                    </TableCell>
                    {skills.map((s) => {
                      const c = r.skills.get(s);
                      const t = targets.get(s) ?? null;
                      return (
                        <TableCell key={s} className="text-center p-1">
                          {c ? (
                            <div className={`rounded px-2 py-1 text-sm font-medium ${cellColor(c.skill_value, t)}`}>
                              {c.skill_value}{t ? `/${t}` : ""}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/40" />соответствует</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500/40" />gap ≤ 15</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-500/40" />gap {'>'} 15</span>
      </div>
    </div>
  );
}

function AddCompetencyDialog({
  profiles,
  onSave,
}: {
  profiles: Profile[];
  onSave: (p: { user_id: string; skill_name: string; skill_value: number; target_value?: number; category?: string }) => void;
}) {
  const [uid, setUid] = useState("");
  const [skill, setSkill] = useState("");
  const [cat, setCat] = useState("");
  const [val, setVal] = useState(50);
  const [target, setTarget] = useState<number | "">("");

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Новая запись</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>Сотрудник</Label>
          <Select value={uid} onValueChange={setUid}>
            <SelectTrigger><SelectValue placeholder="Выбрать" /></SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Навык</Label><Input value={skill} onChange={(e) => setSkill(e.target.value)} /></div>
        <div><Label>Категория (soft / hard / lang / …)</Label><Input value={cat} onChange={(e) => setCat(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Текущий (0–100)</Label><Input type="number" min={0} max={100} value={val} onChange={(e) => setVal(+e.target.value)} /></div>
          <div><Label>Целевой</Label><Input type="number" min={0} max={100} value={target} onChange={(e) => setTarget(e.target.value === "" ? "" : +e.target.value)} /></div>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!uid || !skill.trim()}
          onClick={() => onSave({
            user_id: uid,
            skill_name: skill.trim(),
            skill_value: val,
            target_value: target === "" ? undefined : Number(target),
            category: cat.trim() || undefined,
          })}
        >Сохранить</Button>
      </DialogFooter>
    </DialogContent>
  );
}
