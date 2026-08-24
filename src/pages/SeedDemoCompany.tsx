import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravel } from "@/integrations/laravel/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Database, RotateCcw, Copy, Building2, Route, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CompanyRow { id: string; name: string; users: number }
interface DemoUser { email: string; full_name: string; role: string | null }
interface DemoPosition { id: string; title: string; department: string | null }
interface DemoStatus {
  exists: boolean;
  company_id?: string;
  name?: string;
  counts?: Record<string, number>;
  password?: string;
  users?: DemoUser[];
  positions?: DemoPosition[];
}

interface CareerTrackResult {
  ok: boolean;
  message: string;
  output: string;
  career_templates: number;
  career_assignments: number;
  control_employee_email: string | null;
  control_employee_assignments: number | null;
}


const LAST_COMPANY_KEY = "demo-seed:last-company";

export default function SeedDemoCompany() {
  const qc = useQueryClient();
  const [headcount, setHeadcount] = useState(150);
  const [company, setCompany] = useState<string>(() => localStorage.getItem(LAST_COMPANY_KEY) || "");
  const [customName, setCustomName] = useState("");
  const [output, setOutput] = useState<string>("");

  const { data: companiesData } = useQuery<{ default: string; companies: CompanyRow[] }>({
    queryKey: ["demo-companies"],
    queryFn: async () => (await laravel.get<{ default: string; companies: CompanyRow[] }>("/superadmin/demo/companies")).data,
  });

  const companies = companiesData?.companies || [];

  // Ничего не выбрано (или сохранённой компании больше нет) — подставляем demo_doom,
  // иначе серверный default, иначе первую из списка. Новые компании не создаём.
  useEffect(() => {
    if (!companies.length) return;
    if (company === "__new__") return;
    if (company && companies.some((c) => c.name === company)) return;
    const doom = companies.find((c) => `${c.name} ${c.slug ?? ""}`.toLowerCase().includes("doom"));
    const fallback = doom?.name || companies.find((c) => c.name === companiesData?.default)?.name || companies[0].name;
    setCompany(fallback);
  }, [companies, companiesData?.default, company]);

  const selectCompany = (value: string) => {
    setCompany(value);
    if (value !== "__new__") localStorage.setItem(LAST_COMPANY_KEY, value);
  };

  const targetName = company === "__new__" ? customName.trim() : company;


  const { data: status, isLoading } = useQuery<DemoStatus>({
    queryKey: ["demo-status", targetName],
    queryFn: async () =>
      (await laravel.get<DemoStatus>(`/superadmin/demo/status?company=${encodeURIComponent(targetName)}`)).data,
    enabled: targetName.length > 0,
  });

  /** Достаёт вывод команды из ошибки клиента (диагностика приходит в поле diagnostics). */
  const applyErrorDiagnostics = (e: any) => {
    const d = e?.diagnostics as { output?: string; where?: string; last_step?: string } | undefined;
    const parts = [
      e?.message ? `ОШИБКА: ${e.message}` : "",
      d?.last_step ? `Последний шаг: ${d.last_step}` : "",
      d?.where ? `Место: ${d.where}` : "",
      d?.output || "",
    ].filter(Boolean);
    if (parts.length) setOutput(parts.join("\n"));
  };

  const seed = useMutation({
    mutationFn: async (reset: boolean) => {
      const result = await laravel.post<{ ok: boolean; output: string }>("/superadmin/demo/seed", { reset, headcount, company: targetName });
      if (result.error) throw result.error;
      return result.data!;
    },
    onSuccess: (r) => {
      setOutput(r.output || "");
      toast.success(r.ok ? "Демо-компания создана" : "Готово");
      qc.invalidateQueries({ queryKey: ["demo-status"] });
    },
    onError: (e: any) => {
      applyErrorDiagnostics(e);
      toast.error(e?.message || "Ошибка сидинга");
    },
  });

  const reset = useMutation({
    mutationFn: async () => {
      const result = await laravel.post<{ ok: boolean; output: string }>("/superadmin/demo/reset", { headcount, company: targetName });
      if (result.error) throw result.error;
      return result.data!;
    },
    onSuccess: (r) => {
      setOutput(r.output || "");
      toast.success("Демо-компания сброшена и создана заново");
      qc.invalidateQueries({ queryKey: ["demo-status"] });
    },
    onError: (e: any) => {
      applyErrorDiagnostics(e);
      toast.error(e?.message || "Ошибка сброса");
    },
  });

  const careerTracks = useMutation({
    mutationFn: async () => {
      const result = await laravel.post<CareerTrackResult>("/superadmin/demo/career-tracks", { company: targetName });
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Сервер не вернул результат назначения треков");
      return result.data;
    },
    onSuccess: (r) => {
      setOutput(r.output || "");
      if (r.ok && r.career_assignments > 0) {
        const control = r.control_employee_email && r.control_employee_assignments !== null
          ? `; ${r.control_employee_email}: ${r.control_employee_assignments}`
          : "";
        toast.success(`${r.message}${control}`);
      } else {
        toast.error(r.message || "Треки не назначены — проверьте диагностику ниже");
      }
      qc.invalidateQueries({ queryKey: ["demo-status"] });
    },
    onError: (e: any) => {
      applyErrorDiagnostics(e);
      toast.error(e?.message || "Ошибка назначения треков");
      qc.invalidateQueries({ queryKey: ["demo-status"] });
    },
  });

  const content = useMutation({
    mutationFn: async () => {
      const result = await laravel.post<{ ok: boolean; output: string }>("/superadmin/demo/content", { company: targetName });
      if (result.error) throw result.error;
      if (!result.data?.ok) throw new Error("Контентный прогон завершился с ошибкой");
      return result.data;
    },
    onSuccess: (r) => {
      setOutput(r.output || "");
      toast.success("Все контентные разделы заполнены и проверены");
      qc.invalidateQueries({ queryKey: ["demo-status"] });
    },
    onError: (e: any) => {
      applyErrorDiagnostics(e);
      toast.error(e?.message || "Ошибка контентного прогона");
    },
  });



  const copyAllLogins = () => {
    if (!status?.users) return;
    const rows = status.users
      .map((u) => `${u.email}\tDemoPass!2026\t${u.role || "-"}\t${u.full_name}`)
      .join("\n");
    navigator.clipboard.writeText(rows);
    toast.success(`Скопировано ${status.users.length} логинов`);
  };

  const busy = !targetName || seed.isPending || reset.isPending || careerTracks.isPending || content.isPending;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">Демо-данные: {targetName || "выберите компанию"}</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Инструмент для наполнения продукта реалистичным контентом — для внутренних демо клиентам и smoke-теста ключевых модулей.
        Единый пароль для всех создаваемых учёток: <code className="px-1 rounded bg-muted">DemoPass!2026</code>.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Управление</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px]">
              <Label>Компания</Label>
              <Select value={company} onValueChange={setCompany}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите компанию" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(companiesData?.companies || []).map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name} · {c.users}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ Новая компания…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {company === "__new__" && (
              <div>
                <Label htmlFor="cn">Название новой компании</Label>
                <Input id="cn" value={customName} onChange={(e) => setCustomName(e.target.value)}
                  placeholder='ООО "Тест"' className="w-56" />
              </div>
            )}
            <div>
              <Label htmlFor="hc">Количество сотрудников</Label>
              <Input id="hc" type="number" min={20} max={500} value={headcount}
                onChange={(e) => setHeadcount(Number(e.target.value) || 150)} className="w-32" />
            </div>
            <Button onClick={() => seed.mutate(false)} disabled={busy}>
              {seed.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
              Создать / дополнить
            </Button>
            <Button variant="destructive" onClick={() => reset.mutate()} disabled={busy}>
              {reset.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Сбросить и создать заново
            </Button>
            <Button variant="outline" onClick={() => careerTracks.mutate()} disabled={busy}>
              {careerTracks.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Route className="h-4 w-4 mr-2" />}
              Назначить карьерные треки
            </Button>
            <Button variant="outline" onClick={() => content.mutate()} disabled={busy}>
              {content.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Дозаполнить весь контент
            </Button>
          </div>
          {output && (
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-64">{output}</pre>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаю статус…
        </div>
      ) : status?.exists ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Текущее состояние</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(status.counts || {}).map(([k, v]) => (
                  <div key={k} className="border rounded-lg p-3">
                    <div className="text-xs uppercase text-muted-foreground">{k}</div>
                    <div className="text-2xl font-semibold">{v}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Должности ({status.positions?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {status.positions?.length ? (
                <div className="flex flex-wrap gap-2">
                  {status.positions.map((p) => (
                    <Badge key={p.id} variant="outline" className="font-normal">
                      {p.title}
                      <span className="ml-1 text-muted-foreground">· {p.department || "—"}</span>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Должностей нет — карьерные треки строиться не смогут.
                </p>
              )}
            </CardContent>
          </Card>



          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Логины ({status.users?.length ?? 0})</CardTitle>
              <Button size="sm" variant="outline" onClick={copyAllLogins}>
                <Copy className="h-4 w-4 mr-2" /> Скопировать все
              </Button>
            </CardHeader>
            <CardContent>
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>ФИО</TableHead>
                      <TableHead>Роль</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {status.users?.map((u) => (
                      <TableRow key={u.email}>
                        <TableCell className="font-mono text-xs">{u.email}</TableCell>
                        <TableCell>{u.full_name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{u.role || "—"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => {
                            navigator.clipboard.writeText(u.email);
                            toast.success("Email скопирован");
                          }}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-6 text-muted-foreground">
            Компания «{targetName}» ещё не создана. Нажмите «Создать / дополнить», чтобы её наполнить.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
