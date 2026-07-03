import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravel } from "@/integrations/laravel/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Database, RotateCcw, Copy, Building2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface DemoUser { email: string; full_name: string; role: string | null }
interface DemoStatus {
  exists: boolean;
  company_id?: string;
  name?: string;
  counts?: Record<string, number>;
  password?: string;
  users?: DemoUser[];
}

export default function SeedDemoCompany() {
  const qc = useQueryClient();
  const [headcount, setHeadcount] = useState(150);
  const [output, setOutput] = useState<string>("");

  const { data: status, isLoading } = useQuery<DemoStatus>({
    queryKey: ["demo-status"],
    queryFn: async () => (await laravel.get<DemoStatus>("/superadmin/demo/status")).data,
  });

  const seed = useMutation({
    mutationFn: async (reset: boolean) =>
      (await laravel.post<{ ok: boolean; output: string }>("/superadmin/demo/seed", { reset, headcount })).data,
    onSuccess: (r) => {
      setOutput(r.output || "");
      toast.success(r.ok ? "Демо-компания создана" : "Готово");
      qc.invalidateQueries({ queryKey: ["demo-status"] });
    },
    onError: (e: any) => toast.error(e?.message || "Ошибка сидинга"),
  });

  const reset = useMutation({
    mutationFn: async () =>
      (await laravel.post<{ ok: boolean; output: string }>("/superadmin/demo/reset", { headcount })).data,
    onSuccess: (r) => {
      setOutput(r.output || "");
      toast.success("Демо-компания сброшена и создана заново");
      qc.invalidateQueries({ queryKey: ["demo-status"] });
    },
    onError: (e: any) => toast.error(e?.message || "Ошибка сброса"),
  });

  const copyAllLogins = () => {
    if (!status?.users) return;
    const rows = status.users
      .map((u) => `${u.email}\tDemoPass!2026\t${u.role || "-"}\t${u.full_name}`)
      .join("\n");
    navigator.clipboard.writeText(rows);
    toast.success(`Скопировано ${status.users.length} логинов`);
  };

  const busy = seed.isPending || reset.isPending;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">Демо-компания «ООО Демо»</h1>
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
            Демо-компания ещё не создана. Нажмите «Создать / дополнить», чтобы её наполнить.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
