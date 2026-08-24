import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { laravel } from "@/integrations/laravel/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, RotateCcw, Save } from "lucide-react";

type Flag = "can_view" | "can_edit" | "can_download";
type SubjectType = "role" | "user" | "position" | "department";
type Subject = { id: string; label: string | null };
type MatrixRow = { subject_type: SubjectType; subject_id: string; resource: string; can_view: boolean; can_edit: boolean; can_download: boolean; is_custom: boolean };
type MatrixResponse = {
  resources: { key: string; label: string; group: string }[];
  subjects: { roles: Subject[]; users: Subject[]; positions: Subject[]; departments: Subject[] };
  selected: { type: SubjectType; id: string };
  matrix: MatrixRow[];
  editable: boolean;
};
const FLAGS: { key: Flag; label: string }[] = [
  { key: "can_view", label: "Просмотр" }, { key: "can_edit", label: "Редактирование" }, { key: "can_download", label: "Скачивание" },
];
const TYPE_LABELS: Record<SubjectType, string> = { role: "Роль", user: "Сотрудник", position: "Должность", department: "Отдел" };
const ROLE_LABELS: Record<string, string> = { employee: "Сотрудник", manager: "Руководитель", hr: "HR", hrd: "HRD", company_admin: "Администратор" };

export default function AccessControl() {
  const qc = useQueryClient();
  const [type, setType] = useState<SubjectType>("role");
  const [subjectId, setSubjectId] = useState("employee");
  const [draft, setDraft] = useState<Record<string, MatrixRow>>({});
  const { data, isLoading } = useQuery({
    queryKey: ["access-control", "matrix", type, subjectId],
    queryFn: async () => {
      const { data, error } = await laravel.get<MatrixResponse>(`/access-control/matrix?subject_type=${type}&subject_id=${encodeURIComponent(subjectId)}`);
      if (error) throw new Error(error.message);
      return data as MatrixResponse;
    },
  });
  useEffect(() => { if (data) setDraft(Object.fromEntries(data.matrix.map((row) => [row.resource, row]))); }, [data]);
  const subjects = data ? (type === "role" ? data.subjects.roles : type === "user" ? data.subjects.users : type === "position" ? data.subjects.positions : data.subjects.departments) : [];
  const groups = useMemo(() => {
    const grouped = new Map<string, MatrixResponse["resources"]>();
    for (const item of data?.resources ?? []) grouped.set(item.group, [...(grouped.get(item.group) ?? []), item]);
    return [...grouped.entries()];
  }, [data]);
  const dirty = (data?.matrix ?? []).filter((row) => FLAGS.some(({ key }) => row[key] !== draft[row.resource]?.[key])).map((row) => draft[row.resource]);
  const save = useMutation({
    mutationFn: async () => { const { error } = await laravel.post("/access-control/matrix", { items: dirty }); if (error) throw new Error(error.message); },
    onSuccess: () => { toast.success("Права сохранены"); qc.invalidateQueries({ queryKey: ["access-control"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const reset = useMutation({
    mutationFn: async () => { const { error } = await laravel.post("/access-control/reset", { subject_type: type, subject_id: subjectId }); if (error) throw new Error(error.message); },
    onSuccess: () => { toast.success("Персональные правила сброшены"); qc.invalidateQueries({ queryKey: ["access-control"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const changeType = (next: SubjectType) => {
    setType(next);
    const list = data ? (next === "role" ? data.subjects.roles : next === "user" ? data.subjects.users : next === "position" ? data.subjects.positions : data.subjects.departments) : [];
    setSubjectId(list[0]?.id ?? (next === "role" ? "employee" : ""));
  };
  const toggle = (resource: string, flag: Flag, value: boolean) => setDraft((current) => {
    const row = current[resource]; if (!row) return current;
    const next = { ...row, [flag]: value, subject_type: type, subject_id: subjectId };
    if (flag === "can_view" && !value) { next.can_edit = false; next.can_download = false; }
    if (flag !== "can_view" && value) next.can_view = true;
    return { ...current, [resource]: next };
  });

  return <div className="p-4 md:p-6 space-y-5">
    <header><h1 className="text-2xl font-semibold flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" />Права доступа</h1><p className="text-sm text-muted-foreground">Эффективный приоритет: сотрудник → должность → отдел → роль.</p></header>
    <Card><CardContent className="p-4 grid gap-3 sm:grid-cols-2">
      <div><div className="text-xs text-muted-foreground mb-1">Тип субъекта</div><Select value={type} onValueChange={(value) => changeType(value as SubjectType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TYPE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div><div className="text-xs text-muted-foreground mb-1">Кому назначаются права</div><Select value={subjectId} onValueChange={setSubjectId}><SelectTrigger><SelectValue placeholder="Выберите субъект" /></SelectTrigger><SelectContent>{subjects.map((subject) => <SelectItem key={subject.id} value={subject.id}>{type === "role" ? ROLE_LABELS[subject.id] ?? subject.id : subject.label || subject.id}</SelectItem>)}</SelectContent></Select></div>
    </CardContent></Card>
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={!data?.editable || reset.isPending || !subjectId} onClick={() => reset.mutate()}><RotateCcw className="h-4 w-4 mr-2" />Сбросить</Button><Button disabled={!data?.editable || !dirty.length || save.isPending} onClick={() => save.mutate()}><Save className="h-4 w-4 mr-2" />Сохранить{dirty.length ? ` (${dirty.length})` : ""}</Button></div>
    {isLoading ? <Skeleton className="h-72 w-full" /> : <Tabs defaultValue={groups[0]?.[0] ?? ""}><TabsList className="h-auto flex-wrap">{groups.map(([group]) => <TabsTrigger key={group} value={group}>{group}</TabsTrigger>)}</TabsList>{groups.map(([group, resources]) => <TabsContent key={group} value={group}><Card><CardHeader><CardTitle className="text-base">{group}</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="text-muted-foreground"><th className="text-left py-2">Функционал</th>{FLAGS.map((flag) => <th key={flag.key} className="text-center">{flag.label}</th>)}</tr></thead><tbody>{resources.map((resource) => <tr key={resource.key} className="border-t"><td className="py-3">{resource.label}</td>{FLAGS.map((flag) => <td key={flag.key} className="text-center"><Checkbox aria-label={`${resource.label}: ${flag.label}`} checked={draft[resource.key]?.[flag.key] ?? false} disabled={!data?.editable} onCheckedChange={(value) => toggle(resource.key, flag.key, Boolean(value))} /></td>)}</tr>)}</tbody></table></CardContent></Card></TabsContent>)}</Tabs>}
  </div>;
}
