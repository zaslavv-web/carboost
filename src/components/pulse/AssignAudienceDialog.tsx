import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Check, X, Users, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { laravelDb } from "@/integrations/laravel/db";
import {
  useTargets, useSaveTargets, useResolveRoster, useCommitRoster, useAudience,
  type PulseTargetType, type PulseResolvedUser,
} from "@/hooks/usePulseTargeting";

interface Props {
  surveyId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInviteEmail?: (email: string) => void; // подкидываем email в bulk-invite flow
}

type Dept = { id: string; name: string; parent_id: string | null };
type Position = { id: string; title: string; department: string | null };

export function AssignAudienceDialog({ surveyId, open, onOpenChange, onInviteEmail }: Props) {
  const { data: departments = [] } = useQuery({
    queryKey: ["all-departments"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await laravelDb.from("departments").select("id,name,parent_id").order("name");
      if (error) throw error;
      return (data as Dept[]) ?? [];
    },
  });
  const { data: positions = [] } = useQuery({
    queryKey: ["all-positions"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await laravelDb.from("positions").select("id,title,department").order("title");
      if (error) throw error;
      return (data as Position[]) ?? [];
    },
  });
  const { data: existing } = useTargets(surveyId);
  const { data: audience } = useAudience(surveyId);
  const save = useSaveTargets(surveyId);
  const commit = useCommitRoster(surveyId);
  const resolve = useResolveRoster(surveyId);

  const subdivisions = useMemo(() => departments.filter((d) => !d.parent_id), [departments]);
  const childDepartments = useMemo(() => departments.filter((d) => !!d.parent_id), [departments]);
  const parentName = (pid: string | null) => departments.find((d) => d.id === pid)?.name ?? "—";

  // Локальный набор выбранных таргетов
  const [selected, setSelected] = useState<Record<string, Set<string>>>({
    department: new Set(), subdivision: new Set(), position: new Set(), user: new Set(),
  });
  useEffect(() => {
    if (!existing) return;
    const next: Record<string, Set<string>> = { department: new Set(), subdivision: new Set(), position: new Set(), user: new Set() };
    for (const t of existing.targets) {
      next[t.target_type]?.add(t.target_ref);
    }
    setSelected(next);
  }, [existing]);

  const toggle = (type: PulseTargetType, ref: string) => {
    setSelected((s) => {
      const copy = { ...s, [type]: new Set(s[type]) };
      if (copy[type].has(ref)) copy[type].delete(ref);
      else copy[type].add(ref);
      return copy;
    });
  };

  // Посписочно
  const [emailInput, setEmailInput] = useState("");
  const [emailChips, setEmailChips] = useState<string[]>([]);
  const [resolveResult, setResolveResult] = useState<{ found: PulseResolvedUser[]; not_found: string[] } | null>(null);

  const addChips = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    setEmailChips((prev) => Array.from(new Set([...prev, ...parts])));
    setEmailInput("");
  };
  const removeChip = (email: string) => setEmailChips((prev) => prev.filter((e) => e !== email));
  const fixChip = (email: string) => {
    removeChip(email);
    setEmailInput(email);
    setResolveResult((r) => r ? { ...r, not_found: r.not_found.filter((e) => e !== email) } : r);
  };

  const doResolve = async () => {
    if (!emailChips.length) return;
    try {
      const res = await resolve.mutateAsync(emailChips);
      setResolveResult(res);
    } catch (e: any) {
      toast.error(e?.message ?? "Не удалось проверить email");
    }
  };

  const doSave = async () => {
    if (!surveyId) return;
    const targets: Array<{ type: PulseTargetType; ref: string }> = [];
    (Object.keys(selected) as PulseTargetType[]).forEach((type) => {
      selected[type].forEach((ref) => targets.push({ type, ref }));
    });
    // добавим user из resolved
    if (resolveResult) {
      for (const u of resolveResult.found) {
        if (u.in_company && !targets.some((t) => t.type === "user" && t.ref === u.user_id)) {
          targets.push({ type: "user", ref: u.user_id });
        }
      }
    }
    try {
      await save.mutateAsync(targets);
      if (resolveResult?.not_found.length) {
        // если есть не найденные, но пользователь не разобрал их — фиксируем как invitees
        await commit.mutateAsync({ user_ids: [], external_emails: resolveResult.not_found });
      }
      toast.success("Назначение сохранено");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Ошибка сохранения");
    }
  };

  const totalSelected =
    selected.department.size + selected.subdivision.size + selected.position.size + selected.user.size +
    (resolveResult?.found.filter((f) => f.in_company).length ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Назначить опрос</DialogTitle>
          <DialogDescription>
            Выберите аудиторию по подразделениям, отделам, должностям или посписочно по email.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="subdivision">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto">
            <TabsTrigger value="subdivision">Подразделения ({selected.subdivision.size})</TabsTrigger>
            <TabsTrigger value="department">Отделы ({selected.department.size})</TabsTrigger>
            <TabsTrigger value="position">Должности ({selected.position.size})</TabsTrigger>
            <TabsTrigger value="roster">Посписочно ({emailChips.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="subdivision">
            <ScrollArea className="h-64 rounded-lg border p-2">
              {subdivisions.length === 0 && <p className="text-sm text-muted-foreground p-2">Подразделения не найдены</p>}
              {subdivisions.map((d) => (
                <label key={d.id} className="flex items-center gap-2 py-1 px-2 hover:bg-muted rounded cursor-pointer">
                  <Checkbox checked={selected.subdivision.has(d.id)} onCheckedChange={() => toggle("subdivision", d.id)} />
                  <span className="text-sm">{d.name}</span>
                </label>
              ))}
            </ScrollArea>
            <p className="text-xs text-muted-foreground mt-2">
              Охват подразделения включает сам корневой отдел и все дочерние.
            </p>
          </TabsContent>

          <TabsContent value="department">
            <ScrollArea className="h-64 rounded-lg border p-2">
              {childDepartments.length === 0 && <p className="text-sm text-muted-foreground p-2">Отделы не найдены</p>}
              {childDepartments.map((d) => (
                <label key={d.id} className="flex items-center gap-2 py-1 px-2 hover:bg-muted rounded cursor-pointer">
                  <Checkbox checked={selected.department.has(d.id)} onCheckedChange={() => toggle("department", d.id)} />
                  <span className="text-sm">{d.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{parentName(d.parent_id)}</span>
                </label>
              ))}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="position">
            <ScrollArea className="h-64 rounded-lg border p-2">
              {positions.length === 0 && <p className="text-sm text-muted-foreground p-2">Должности не найдены</p>}
              {positions.map((p) => (
                <label key={p.id} className="flex items-center gap-2 py-1 px-2 hover:bg-muted rounded cursor-pointer">
                  <Checkbox checked={selected.position.has(p.id)} onCheckedChange={() => toggle("position", p.id)} />
                  <span className="text-sm">{p.title}</span>
                  {p.department && <span className="text-xs text-muted-foreground ml-auto">{p.department}</span>}
                </label>
              ))}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="roster">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1 border rounded-md p-2 min-h-[42px]">
                {emailChips.map((e) => (
                  <Badge key={e} variant="secondary" className="gap-1">
                    {e}
                    <button type="button" onClick={() => removeChip(e)} className="ml-1 hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  className="flex-1 outline-none bg-transparent text-sm min-w-[140px]"
                  placeholder="Введите email и Enter…"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === "Tab") {
                      if (emailInput.trim()) { e.preventDefault(); addChips(emailInput); }
                    } else if (e.key === "Backspace" && !emailInput && emailChips.length) {
                      removeChip(emailChips[emailChips.length - 1]);
                    }
                  }}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    if (/[\s,;]/.test(text)) { e.preventDefault(); addChips(text); }
                  }}
                  onBlur={() => emailInput.trim() && addChips(emailInput)}
                />
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={doResolve} disabled={!emailChips.length || resolve.isPending}>
                  {resolve.isPending ? "Проверка…" : "Проверить"}
                </Button>
              </div>

              {resolveResult && (
                <div className="space-y-2">
                  {resolveResult.found.length > 0 && (
                    <Alert>
                      <Check className="h-4 w-4" />
                      <AlertTitle>Найдены ({resolveResult.found.length})</AlertTitle>
                      <AlertDescription>
                        <ul className="space-y-1 mt-1">
                          {resolveResult.found.map((f) => (
                            <li key={f.email} className="text-sm">
                              <span className="font-medium">{f.full_name ?? "—"}</span>
                              <span className="text-muted-foreground"> · {f.email}</span>
                              {!f.in_company && <Badge variant="outline" className="ml-2 text-[10px]">вне компании</Badge>}
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                  {resolveResult.not_found.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Не найдены ({resolveResult.not_found.length})</AlertTitle>
                      <AlertDescription className="space-y-2">
                        <p className="text-sm">Сотрудник с таким адресом не найден. Что сделать?</p>
                        <ul className="space-y-2">
                          {resolveResult.not_found.map((email) => (
                            <li key={email} className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-mono">{email}</span>
                              <div className="ml-auto flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => onInviteEmail?.(email)}>
                                  <UserPlus className="w-3 h-3 mr-1" />Создать сотрудника
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => fixChip(email)}>
                                  Исправить адрес
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center gap-2 text-sm text-muted-foreground border-t pt-3">
          <Users className="w-4 h-4" />
          Выбрано целей: <strong className="text-foreground">{totalSelected}</strong>
          {audience && <span>· текущий охват: <strong className="text-foreground">{audience.count}</strong> сотр.</span>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={doSave} disabled={save.isPending || commit.isPending}>
            {save.isPending ? "Сохранение…" : "Сохранить назначение"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
