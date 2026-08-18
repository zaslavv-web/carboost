/**
 * Epic B1 — Интеграция с 1С:ЗУП 8.3.
 *
 * Вкладки: Подключение · Маппинг полей · Импорт · Журнал синхронизаций.
 * Доступ — HR/HRD/company_admin/superadmin.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plug, Plus, Trash2, RefreshCw, Loader2, Upload, Download, CheckCircle2,
  AlertTriangle, XCircle, ArrowRight, FileSpreadsheet, Wallet,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import {
  oneC, ENTITY_LABELS,
  type OneCConnection, type OneCEntity, type FieldMapping,
  type SyncRun, type SyncRecord, type TargetField, type ImportResult,
} from "@/integrations/laravel/oneC";

const ENTITIES: OneCEntity[] = ["department", "position", "employee", "payroll"];

const statusBadge = (status?: string | null) => {
  if (status === "success") return <Badge className="bg-emerald-600/15 text-emerald-500">Успешно</Badge>;
  if (status === "partial") return <Badge className="bg-amber-500/15 text-amber-500">С ошибками</Badge>;
  if (status === "failed") return <Badge className="bg-destructive/15 text-destructive">Ошибка</Badge>;
  if (status === "running") return <Badge variant="secondary">Выполняется</Badge>;
  return <Badge variant="outline">—</Badge>;
};

export default function IntegrationOneC() {
  const [tab, setTab] = useState("connection");

  // --- connections ---
  const [connections, setConnections] = useState<OneCConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OneCConnection | null>(null);
  const [form, setForm] = useState({
    name: "1С:ЗУП 8.3", base_url: "", auth_type: "basic" as "basic" | "none",
    username: "", secret: "", verify_tls: true, is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // --- mapping ---
  const [entity, setEntity] = useState<OneCEntity>("employee");
  const [targetFields, setTargetFields] = useState<Record<string, TargetField[]>>({});
  const [odataPaths, setOdataPaths] = useState<Record<string, string>>({});
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [savingMap, setSavingMap] = useState(false);

  // --- import ---
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [sample, setSample] = useState<any[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  // --- journal ---
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [openRun, setOpenRun] = useState<SyncRun | null>(null);
  const [runRecords, setRunRecords] = useState<SyncRecord[]>([]);
  const [payroll, setPayroll] = useState<{ period: string; kind: string; entries: number; total: number }[]>([]);

  const activeConnection = connections.find((c) => c.is_active) ?? connections[0] ?? null;

  const load = async () => {
    setLoading(true);
    const [c, t, r, p] = await Promise.all([
      oneC.listConnections(), oneC.targetFields(), oneC.listRuns(), oneC.payrollSummary(),
    ]);
    setConnections(c.data?.data ?? []);
    setTargetFields((t.data?.fields as any) ?? {});
    setOdataPaths((t.data?.odata_paths as any) ?? {});
    setRuns(r.data?.data ?? []);
    setPayroll(p.data?.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    oneC.listMappings(entity).then(({ data }) => setMappings(data?.data ?? []));
  }, [entity]);

  // ---------- connections ----------
  const openCreate = () => {
    setEditing(null);
    setForm({ name: "1С:ЗУП 8.3", base_url: "", auth_type: "basic", username: "", secret: "", verify_tls: true, is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (c: OneCConnection) => {
    setEditing(c);
    setForm({
      name: c.name, base_url: c.base_url ?? "", auth_type: c.auth_type ?? "basic",
      username: c.username ?? "", secret: "", verify_tls: !!c.verify_tls, is_active: !!c.is_active,
    });
    setDialogOpen(true);
  };

  const saveConnection = async () => {
    if (!form.name.trim()) return toast.error("Укажите название подключения");
    setSaving(true);
    const body: any = { ...form };
    if (!body.secret) delete body.secret;
    const { error } = editing
      ? await oneC.updateConnection(editing.id, body)
      : await oneC.createConnection(body);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Подключение обновлено" : "Подключение создано");
    setDialogOpen(false);
    load();
  };

  const testConnection = async (c: OneCConnection) => {
    setTestingId(c.id);
    const { data, error } = await oneC.testConnection(c.id);
    setTestingId(null);
    if (error) return toast.error(error.message);
    data?.ok ? toast.success(data.message) : toast.error(data?.message ?? "Нет связи с 1С");
    load();
  };

  const removeConnection = async (c: OneCConnection) => {
    const { error } = await oneC.deleteConnection(c.id);
    if (error) return toast.error(error.message);
    toast.success("Подключение удалено");
    load();
  };

  // ---------- mapping ----------
  const fields = targetFields[entity] ?? [];

  const setMapping = (target: string, source: string) => {
    setMappings((prev) => {
      const rest = prev.filter((m) => m.target_field !== target);
      if (!source) return rest;
      return [...rest, { entity, target_field: target, source_field: source, transform: null }];
    });
  };

  const mappingFor = (target: string) =>
    mappings.find((m) => m.target_field === target)?.source_field ?? "";

  const saveMappings = async () => {
    setSavingMap(true);
    const { error } = await oneC.saveMappings(entity, mappings, activeConnection?.id ?? null);
    setSavingMap(false);
    if (error) return toast.error(error.message);
    toast.success("Маппинг сохранён");
  };

  // ---------- import ----------
  const pickFile = async (f: File | null) => {
    setFile(f);
    setColumns([]); setSample([]);
    if (!f) return;
    const { data, error } = await oneC.preview(f);
    if (error) return toast.error(error.message);
    if (!data?.ok) return toast.error(data?.message ?? "Не удалось разобрать файл");
    setColumns(data.columns ?? []);
    setSample(data.sample ?? []);
    toast.success(`Распознано строк: ${data.total}`);
  };

  const runImport = async () => {
    if (!file) return toast.error("Выберите файл CSV или XML");
    setImporting(true);
    const { data, error } = await oneC.importFile(file, entity, { dryRun, connectionId: activeConnection?.id });
    setImporting(false);
    if (error) return toast.error(error.message);
    setLastResult(data ?? null);
    toast.success(dryRun ? "Пробный прогон завершён" : "Импорт завершён");
    load();
  };

  const runPull = async () => {
    if (!activeConnection) return toast.error("Сначала настройте подключение к 1С");
    setImporting(true);
    const { data, error } = await oneC.pull(activeConnection.id, entity, { dryRun });
    setImporting(false);
    if (error) return toast.error(error.message);
    if (data && data.ok === false) return toast.error(data.message ?? "Ошибка обращения к 1С");
    setLastResult(data ?? null);
    toast.success("Загрузка из 1С завершена");
    load();
  };

  // ---------- journal ----------
  const showRun = async (run: SyncRun) => {
    setOpenRun(run);
    const { data } = await oneC.runRecords(run.id);
    setRunRecords(data?.data ?? []);
  };

  const retry = async (run: SyncRun) => {
    const { data, error } = await oneC.retryRun(run.id);
    if (error) return toast.error(error.message);
    toast.success(data?.message ?? "Повтор выполнен");
    load();
  };

  const payrollTotals = useMemo(() => {
    const byPeriod = new Map<string, { accrual: number; deduction: number }>();
    payroll.forEach((p) => {
      const cur = byPeriod.get(p.period) ?? { accrual: 0, deduction: 0 };
      if (p.kind === "deduction") cur.deduction += Number(p.total || 0);
      else cur.accrual += Number(p.total || 0);
      byPeriod.set(p.period, cur);
    });
    return Array.from(byPeriod.entries()).slice(0, 12);
  }, [payroll]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Интеграция с 1С:ЗУП 8.3</h1>
          <p className="text-sm text-muted-foreground">
            Оргструктура, кадровые события, начисления — через OData или выгрузку EnterpriseData/CSV.
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="mr-2 h-4 w-4" /> Обновить
        </Button>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="connection">Подключение</TabsTrigger>
          <TabsTrigger value="mapping">Маппинг полей</TabsTrigger>
          <TabsTrigger value="import">Импорт</TabsTrigger>
          <TabsTrigger value="journal">Журнал</TabsTrigger>
          <TabsTrigger value="payroll">Начисления</TabsTrigger>
        </TabsList>

        {/* ============ Подключение ============ */}
        <TabsContent value="connection" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Новое подключение
            </Button>
          </div>

          {connections.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                <Plug className="h-8 w-8" />
                <p>Подключений к 1С:ЗУП пока нет. Можно работать и без него — через импорт файлов.</p>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {connections.map((c) => (
              <Card key={c.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                  <div>
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <CardDescription className="break-all">{c.base_url || "адрес не указан"}</CardDescription>
                  </div>
                  {statusBadge(c.last_status)}
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="text-muted-foreground">
                    Пользователь: {c.username || "—"} · TLS: {c.verify_tls ? "проверять" : "без проверки"}
                  </div>
                  {c.last_sync_at && (
                    <div className="text-muted-foreground">
                      Последняя синхронизация: {new Date(c.last_sync_at).toLocaleString("ru-RU")}
                    </div>
                  )}
                  {c.last_error && <div className="text-destructive">{c.last_error}</div>}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => testConnection(c)} disabled={testingId === c.id}>
                      {testingId === c.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
                      Проверить
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Изменить</Button>
                    <Button size="sm" variant="ghost" onClick={() => removeConnection(c)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ============ Маппинг ============ */}
        <TabsContent value="mapping" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Сопоставление полей</CardTitle>
              <CardDescription>
                Слева — поля платформы, справа — имя колонки файла или реквизита 1С.
                Если оставить пусто, колонка с таким же именем подхватится автоматически.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Label className="text-sm">Сущность</Label>
                <Select value={entity} onValueChange={(v) => setEntity(v as OneCEntity)}>
                  <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENTITIES.map((e) => (
                      <SelectItem key={e} value={e}>{ENTITY_LABELS[e]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge variant="outline">OData: {odataPaths[entity] ?? "—"}</Badge>
              </div>

              <div className="space-y-2">
                {fields.map((f) => (
                  <div key={f.key} className="flex flex-wrap items-center gap-3">
                    <div className="w-64 text-sm">
                      {f.label}{f.required && <span className="text-destructive"> *</span>}
                      <div className="text-xs text-muted-foreground">{f.key}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Input
                      className="w-72"
                      placeholder="Имя колонки / реквизита 1С"
                      value={mappingFor(f.key)}
                      onChange={(e) => setMapping(f.key, e.target.value)}
                      list={`cols-${entity}`}
                    />
                  </div>
                ))}
                <datalist id={`cols-${entity}`}>
                  {columns.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>

              <Button onClick={saveMappings} disabled={savingMap}>
                {savingMap && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Сохранить маппинг
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ Импорт ============ */}
        <TabsContent value="import" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Загрузка данных</CardTitle>
              <CardDescription>
                Файл выгрузки из 1С (CSV или EnterpriseData XML) либо прямая загрузка по OData.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Select value={entity} onValueChange={(v) => setEntity(v as OneCEntity)}>
                  <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENTITIES.map((e) => (
                      <SelectItem key={e} value={e}>{ENTITY_LABELS[e]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Switch id="dry" checked={dryRun} onCheckedChange={setDryRun} />
                  <Label htmlFor="dry" className="text-sm">Пробный прогон (без записи)</Label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Input
                  type="file"
                  accept=".csv,.xml,text/csv,text/xml,application/xml"
                  className="w-80"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
                <Button onClick={runImport} disabled={importing || !file}>
                  {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Импортировать файл
                </Button>
                <Button variant="secondary" onClick={runPull} disabled={importing || !activeConnection}>
                  <Download className="mr-2 h-4 w-4" /> Загрузить из 1С (OData)
                </Button>
              </div>

              {columns.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>{columns.slice(0, 8).map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow>
                    </TableHeader>
                    <TableBody>
                      {sample.slice(0, 5).map((r, i) => (
                        <TableRow key={i}>
                          {columns.slice(0, 8).map((c) => (
                            <TableCell key={c} className="max-w-[200px] truncate">{String(r[c] ?? "")}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {lastResult?.stats && (
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge className="bg-emerald-600/15 text-emerald-500">Создано: {lastResult.stats.created ?? 0}</Badge>
                  <Badge className="bg-sky-600/15 text-sky-500">Обновлено: {lastResult.stats.updated ?? 0}</Badge>
                  <Badge variant="outline">Пропущено: {lastResult.stats.skipped ?? 0}</Badge>
                  <Badge className="bg-destructive/15 text-destructive">Ошибок: {lastResult.stats.failed ?? 0}</Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ Журнал ============ */}
        <TabsContent value="journal" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Журнал синхронизаций</CardTitle>
              <CardDescription>Построчные результаты и повтор упавших строк.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Сущность</TableHead>
                    <TableHead>Источник</TableHead>
                    <TableHead>Итог</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.started_at ? new Date(r.started_at).toLocaleString("ru-RU") : "—"}</TableCell>
                      <TableCell>{ENTITY_LABELS[r.entity]}</TableCell>
                      <TableCell>{r.source === "odata" ? "OData" : "Файл"}{r.dry_run ? " · проба" : ""}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <span className="text-emerald-500">+{r.created_count}</span>{" / "}
                        <span className="text-sky-500">~{r.updated_count}</span>{" / "}
                        <span className="text-muted-foreground">{r.skipped_count}</span>{" / "}
                        <span className="text-destructive">{r.failed_count}</span>
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => showRun(r)}>Детали</Button>
                        {r.failed_count > 0 && (
                          <Button size="sm" variant="outline" onClick={() => retry(r)}>Повторить</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {runs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Синхронизаций ещё не было
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ Начисления ============ */}
        <TabsContent value="payroll" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4" /> Начисления и удержания из 1С:ЗУП
              </CardTitle>
              <CardDescription>Свод по периодам импортированных расчётных данных.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Период</TableHead>
                    <TableHead>Начислено</TableHead>
                    <TableHead>Удержано</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollTotals.map(([period, v]) => (
                    <TableRow key={period}>
                      <TableCell>{period}</TableCell>
                      <TableCell>{v.accrual.toLocaleString("ru-RU")} ₽</TableCell>
                      <TableCell>{v.deduction.toLocaleString("ru-RU")} ₽</TableCell>
                    </TableRow>
                  ))}
                  {payrollTotals.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                        <FileSpreadsheet className="mx-auto mb-2 h-6 w-6" />
                        Данных пока нет — импортируйте начисления на вкладке «Импорт»
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Диалог подключения */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Изменить подключение" : "Новое подключение к 1С:ЗУП"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Название</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Адрес OData-сервиса</Label>
              <Input
                placeholder="https://1c.company.ru/zup/odata/standard.odata"
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Пользователь 1С</Label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div>
                <Label>Пароль</Label>
                <Input
                  type="password"
                  placeholder={editing ? "оставьте пустым, чтобы не менять" : ""}
                  value={form.secret}
                  onChange={(e) => setForm({ ...form, secret: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.verify_tls} onCheckedChange={(v) => setForm({ ...form, verify_tls: v })} />
                <Label className="text-sm">Проверять TLS-сертификат</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label className="text-sm">Активно</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={saveConnection} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Детали запуска */}
      <Dialog open={!!openRun} onOpenChange={(o) => !o && setOpenRun(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Результат синхронизации · {openRun ? ENTITY_LABELS[openRun.entity] : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Объект</TableHead>
                  <TableHead>Код 1С</TableHead>
                  <TableHead>Действие</TableHead>
                  <TableHead>Комментарий</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runRecords.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[220px] truncate">{r.title ?? "—"}</TableCell>
                    <TableCell>{r.external_id ?? "—"}</TableCell>
                    <TableCell>
                      {r.action === "created" && <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-4 w-4" />создан</span>}
                      {r.action === "updated" && <span className="flex items-center gap-1 text-sky-500"><CheckCircle2 className="h-4 w-4" />обновлён</span>}
                      {r.action === "skipped" && <span className="flex items-center gap-1 text-muted-foreground"><AlertTriangle className="h-4 w-4" />пропущен</span>}
                      {r.action === "failed" && <span className="flex items-center gap-1 text-destructive"><XCircle className="h-4 w-4" />ошибка</span>}
                    </TableCell>
                    <TableCell className="max-w-[300px] text-sm text-muted-foreground">{r.error ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
