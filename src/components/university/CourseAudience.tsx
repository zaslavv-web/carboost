import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { laravel } from "@/integrations/laravel/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, Search, Download, Upload, Trash2, UserPlus } from "lucide-react";

interface AudienceUser {
  user_id: string; full_name: string | null; email: string | null;
  department: string | null; position: string | null; grade: string | null;
}
interface EnrollmentRow {
  id: string; user_id: string; full_name: string | null; email: string | null;
  department: string | null; position: string | null; status: string; due_at: string | null;
}

const TEMPLATE_HEADER = "email;ФИО (необязательно);Комментарий\n";
const TEMPLATE_SAMPLE = "ivanov@company.ru;Иванов Иван Иванович;\npetrova@company.ru;Петрова Мария;\n";

/** Привязка курса к ученикам: точечно, по отделам, грейдам, стажу, должностям или списком. */
export function CourseAudience({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<AudienceUser[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [tenureMin, setTenureMin] = useState("");
  const [tenureMax, setTenureMax] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [mandatory, setMandatory] = useState(false);
  const [blocksOther, setBlocksOther] = useState(false);
  const [dueAt, setDueAt] = useState("");
  const [preview, setPreview] = useState<{ total: number; to_enroll: number; already_enrolled: number } | null>(null);

  const { data: options } = useQuery({
    queryKey: ["uni-audience-options"],
    queryFn: async () =>
      (await laravel.get<{ departments: string[]; positions: { id: string; title: string }[]; grades: string[] }>(
        "/university/audience/options"
      )).data!,
  });

  const { data: found } = useQuery({
    queryKey: ["uni-audience-search", search],
    queryFn: async () =>
      (await laravel.get<{ users: AudienceUser[] }>(
        `/university/audience/search?q=${encodeURIComponent(search)}`
      )).data!,
  });

  const { data: enrolled } = useQuery({
    queryKey: ["uni-course-enrollments", courseId],
    queryFn: async () =>
      (await laravel.get<{ enrollments: EnrollmentRow[] }>(`/university/courses/${courseId}/enrollments`)).data!,
    enabled: !!courseId,
  });

  const rules = useMemo(
    () => ({
      user_ids: selectedUsers.map((u) => u.user_id),
      emails,
      departments,
      grades,
      position_ids: positionIds,
      tenure_min_months: tenureMin === "" ? null : Number(tenureMin),
      tenure_max_months: tenureMax === "" ? null : Number(tenureMax),
      mandatory,
      blocks_other: blocksOther,
      due_at: dueAt || null,
    }),
    [selectedUsers, emails, departments, grades, positionIds, tenureMin, tenureMax, mandatory, blocksOther, dueAt]
  );

  const previewMut = useMutation({
    mutationFn: async () =>
      (await laravel.post<{ total: number; to_enroll: number; already_enrolled: number }>(
        `/university/courses/${courseId}/assign/preview`,
        rules
      )).data!,
    onSuccess: (d) => setPreview(d),
    onError: (e: any) => toast.error(e?.message ?? "Не удалось рассчитать аудиторию"),
  });

  const assignMut = useMutation({
    mutationFn: async () =>
      (await laravel.post<{ created: number; skipped: number }>(`/university/courses/${courseId}/assign`, rules)).data!,
    onSuccess: (d) => {
      toast.success(`Назначено: ${d.created}. Уже были записаны: ${d.skipped}`);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["uni-course-enrollments", courseId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось назначить курс"),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => (await laravel.delete(`/university/enrollments/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["uni-course-enrollments", courseId] }),
  });

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const downloadTemplate = () => {
    const blob = new Blob(["\uFEFF" + TEMPLATE_HEADER + TEMPLATE_SAMPLE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shablon-spiska-uchenikov.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Шаблон скачан — заполните колонку email");
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = text
      .split(/\r?\n/)
      .map((line) => line.split(/[;,\t]/)[0]?.trim().replace(/^"|"$/g, "") ?? "")
      .filter((v) => v.includes("@"));
    const unique = Array.from(new Set(parsed.map((v) => v.toLowerCase())));
    if (!unique.length) {
      toast.error("В файле не найдено ни одного email. Используйте шаблон.");
      return;
    }
    setEmails(unique);
    toast.success(`Загружено email: ${unique.length}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Ученики курса
        </CardTitle>
        <CardDescription>
          Привяжите обучение точечно, по отделам, грейдам, стажу и должностям — или загрузите список.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="people">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="people">Сотрудники</TabsTrigger>
            <TabsTrigger value="filters">Отделы, грейды, стаж</TabsTrigger>
            <TabsTrigger value="import">Загрузить список</TabsTrigger>
            <TabsTrigger value="current">Назначенные ({enrolled?.enrollments?.length ?? 0})</TabsTrigger>
          </TabsList>

          {/* 1. Точечная привязка по ФИО */}
          <TabsContent value="people" className="space-y-3 pt-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Поиск по ФИО или email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedUsers.map((u) => (
                  <Badge key={u.user_id} variant="secondary" className="gap-1">
                    {u.full_name ?? u.email}
                    <button onClick={() => setSelectedUsers((p) => p.filter((x) => x.user_id !== u.user_id))}>×</button>
                  </Badge>
                ))}
              </div>
            )}
            <ScrollArea className="h-56 rounded-md border">
              <div className="p-2 space-y-1">
                {(found?.users ?? []).map((u) => {
                  const checked = selectedUsers.some((s) => s.user_id === u.user_id);
                  return (
                    <label
                      key={u.user_id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setSelectedUsers((p) =>
                            checked ? p.filter((x) => x.user_id !== u.user_id) : [...p, u]
                          )
                        }
                      />
                      <span className="flex-1 truncate">{u.full_name ?? "—"}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[45%]">
                        {[u.position, u.department].filter(Boolean).join(" · ") || u.email}
                      </span>
                    </label>
                  );
                })}
                {(found?.users?.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground p-2">Ничего не найдено</p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* 2-5. Отделы, грейды, должности, стаж */}
          <TabsContent value="filters" className="space-y-4 pt-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs uppercase text-muted-foreground">Отделы</Label>
                <ScrollArea className="h-40 rounded-md border mt-1">
                  <div className="p-2 space-y-1">
                    {(options?.departments ?? []).map((d) => (
                      <label key={d} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                        <Checkbox
                          checked={departments.includes(d)}
                          onCheckedChange={() => toggle(departments, setDepartments, d)}
                        />
                        <span className="truncate">{d}</span>
                      </label>
                    ))}
                    {(options?.departments?.length ?? 0) === 0 && (
                      <p className="text-xs text-muted-foreground">Отделы не заданы</p>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div>
                <Label className="text-xs uppercase text-muted-foreground">Грейды</Label>
                <ScrollArea className="h-40 rounded-md border mt-1">
                  <div className="p-2 space-y-1">
                    {(options?.grades ?? []).map((g) => (
                      <label key={g} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                        <Checkbox checked={grades.includes(g)} onCheckedChange={() => toggle(grades, setGrades, g)} />
                        <span className="truncate">{g}</span>
                      </label>
                    ))}
                    {(options?.grades?.length ?? 0) === 0 && (
                      <p className="text-xs text-muted-foreground">Грейды у сотрудников пока не заполнены</p>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div>
                <Label className="text-xs uppercase text-muted-foreground">Должности</Label>
                <ScrollArea className="h-40 rounded-md border mt-1">
                  <div className="p-2 space-y-1">
                    {(options?.positions ?? []).map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                        <Checkbox
                          checked={positionIds.includes(p.id)}
                          onCheckedChange={() => toggle(positionIds, setPositionIds, p.id)}
                        />
                        <span className="truncate">{p.title}</span>
                      </label>
                    ))}
                    {(options?.positions?.length ?? 0) === 0 && (
                      <p className="text-xs text-muted-foreground">Должности не созданы</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Стаж в компании от (мес.)</Label>
                <Input type="number" min={0} value={tenureMin} onChange={(e) => setTenureMin(e.target.value)} placeholder="напр. 0" />
              </div>
              <div>
                <Label>Стаж в компании до (мес.)</Label>
                <Input type="number" min={0} value={tenureMax} onChange={(e) => setTenureMax(e.target.value)} placeholder="напр. 3" />
              </div>
            </div>
          </TabsContent>

          {/* 6. Импорт списка */}
          <TabsContent value="import" className="space-y-3 pt-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="w-4 h-4 mr-2" /> Скачать шаблон
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" /> Загрузить заполненный файл
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Формат: первая колонка — email сотрудника. Сотрудники, которых нет в компании, будут пропущены.
            </p>
            {emails.length > 0 && (
              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span>Из файла загружено адресов: {emails.length}</span>
                  <Button size="sm" variant="ghost" onClick={() => setEmails([])}>Очистить</Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {emails.slice(0, 20).map((e) => (
                    <Badge key={e} variant="outline">{e}</Badge>
                  ))}
                  {emails.length > 20 && <Badge variant="outline">+{emails.length - 20}</Badge>}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="current" className="pt-3">
            <ScrollArea className="h-64 rounded-md border">
              <div className="p-2 space-y-1">
                {(enrolled?.enrollments ?? []).map((e) => (
                  <div key={e.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-muted">
                    <span className="flex-1 truncate">{e.full_name ?? e.email ?? e.user_id}</span>
                    <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeMut.mutate(e.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                {(enrolled?.enrollments?.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground p-2">Пока никто не назначен</p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Параметры назначения */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
          <div>
            <Label>Дедлайн</Label>
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={mandatory} onCheckedChange={setMandatory} />
            <Label>Обязательный</Label>
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={blocksOther} onCheckedChange={setBlocksOther} />
            <Label>Блокировать другие модули</Label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => previewMut.mutate()} disabled={previewMut.isPending}>
            Рассчитать аудиторию
          </Button>
          <Button onClick={() => assignMut.mutate()} disabled={assignMut.isPending}>
            <UserPlus className="w-4 h-4 mr-2" /> Назначить курс
          </Button>
          {preview && (
            <span className="text-sm text-muted-foreground">
              Найдено {preview.total}, будет назначено {preview.to_enroll}, уже записаны {preview.already_enrolled}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default CourseAudience;
