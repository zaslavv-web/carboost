import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  kedo, KedoDocument, KedoRoute, KedoRouteStep, KedoScopeType, KedoTemplate,
  KEDO_ACTION_LABELS, KEDO_CATEGORY_LABELS, KEDO_STATUS_LABELS,
} from "@/integrations/laravel/kedo";
import { useEmployees } from "@/components/tracker/EmployeePicker";
import RouteBuilder from "@/components/kedo/RouteBuilder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  FileSignature, FileText, Loader2, Plus, Route as RouteIcon, Send, ShieldCheck,
  Trash2, XCircle,
} from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  in_review: "secondary",
  signed: "default",
  rejected: "destructive",
  cancelled: "outline",
};

/** Epic B2 — рабочее место КЭДО для HR: документы, шаблоны, маршруты, ЭДО. */
const Kedo = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState("documents");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [openDocId, setOpenDocId] = useState<string | null>(null);

  const { data: stats } = useQuery({ queryKey: ["kedo.stats"], queryFn: kedo.stats });
  const { data: templatesRes, isLoading: tplLoading } = useQuery({
    queryKey: ["kedo.templates"], queryFn: kedo.listTemplates,
  });
  const { data: routesRes } = useQuery({ queryKey: ["kedo.routes"], queryFn: kedo.listRoutes });
  const { data: docsRes, isLoading: docsLoading } = useQuery({
    queryKey: ["kedo.documents", statusFilter, search],
    queryFn: () => kedo.listDocuments({
      status: statusFilter === "all" ? undefined : statusFilter,
      search: search || undefined,
    }),
  });

  const templates = templatesRes?.data ?? [];
  const routes = routesRes?.data ?? [];
  const documents = docsRes?.data ?? [];

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["kedo.documents"] });
    qc.invalidateQueries({ queryKey: ["kedo.stats"] });
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSignature className="h-6 w-6 text-primary" /> КЭДО
        </h1>
        <p className="text-sm text-muted-foreground">
          Кадровый электронный документооборот: шаблоны, маршруты, подписание ПЭП/УКЭП и юридически значимое хранение.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Всего документов" value={stats?.total ?? 0} />
        <StatCard label="На подписании" value={stats?.by_status?.in_review ?? 0} />
        <StatCard label="Подписано" value={stats?.by_status?.signed ?? 0} />
        <StatCard label="Шаблонов" value={stats?.templates ?? 0} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="documents">Документы</TabsTrigger>
          <TabsTrigger value="templates">Шаблоны</TabsTrigger>
          <TabsTrigger value="routes">Маршруты</TabsTrigger>
          <TabsTrigger value="edo">ГИС ЭДО</TabsTrigger>
        </TabsList>

        {/* ---------------- Документы ---------------- */}
        <TabsContent value="documents" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              placeholder="Поиск по названию"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {Object.entries(KEDO_STATUS_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <IssueDocumentDialog templates={templates} routes={routes} onCreated={refreshAll} />
          </div>

          {docsLoading ? (
            <Loader />
          ) : documents.length === 0 ? (
            <EmptyState text="Документов пока нет — выпустите первый по шаблону." />
          ) : (
            <div className="space-y-2">
              {documents.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setOpenDocId(d.id)}
                  className="w-full text-left rounded-lg border bg-card p-3 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium">{d.title}</span>
                    <Badge variant={STATUS_VARIANT[d.status] ?? "outline"}>{KEDO_STATUS_LABELS[d.status]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {KEDO_CATEGORY_LABELS[d.category] ?? d.category}
                    </span>
                    <div className="flex-1" />
                    <span className="text-xs text-muted-foreground">{d.employee_name}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------- Шаблоны ---------------- */}
        <TabsContent value="templates" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <TemplateDialog routes={routes} onSaved={() => qc.invalidateQueries({ queryKey: ["kedo.templates"] })} />
          </div>
          {tplLoading ? <Loader /> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((t) => (
                <Card key={t.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-start gap-2">
                      <span className="flex-1">{t.title}</span>
                      {t.is_system ? <Badge variant="outline">Системный</Badge> : <Badge>Компания</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      {KEDO_CATEGORY_LABELS[t.category] ?? t.category} · подпись: {t.signature_kind.toUpperCase()} · хранение {t.retention_years} лет
                    </div>
                    <div className="flex gap-2">
                      <TemplateDialog
                        routes={routes}
                        template={t}
                        onSaved={() => qc.invalidateQueries({ queryKey: ["kedo.templates"] })}
                      />
                      {!t.is_system && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await kedo.deleteTemplate(t.id);
                            qc.invalidateQueries({ queryKey: ["kedo.templates"] });
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------- Маршруты ---------------- */}
        <TabsContent value="routes" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <RouteDialog onSaved={() => qc.invalidateQueries({ queryKey: ["kedo.routes"] })} />
          </div>
          {routes.length === 0 ? (
            <EmptyState text="Маршрутов нет. Без маршрута документ подписывает сам сотрудник." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {routes.map((r) => (
                <Card key={r.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <RouteIcon className="h-4 w-4 text-primary" /> {r.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <ol className="text-xs text-muted-foreground space-y-1">
                      {r.steps.map((s, i) => (
                        <li key={s.id ?? i}>
                          {i + 1}. {KEDO_ACTION_LABELS[s.action]} — {s.title || s.actor_type}
                          {s.due_days ? ` (${s.due_days} дн.)` : ""}
                        </li>
                      ))}
                    </ol>
                    <div className="flex gap-2">
                      <RouteDialog route={r} onSaved={() => qc.invalidateQueries({ queryKey: ["kedo.routes"] })} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await kedo.deleteRoute(r.id);
                          qc.invalidateQueries({ queryKey: ["kedo.routes"] });
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------- ГИС ЭДО ---------------- */}
        <TabsContent value="edo" className="pt-4">
          <EdoTab documents={documents} />
        </TabsContent>
      </Tabs>

      {openDocId && (
        <DocumentDialog
          documentId={openDocId}
          onClose={() => setOpenDocId(null)}
          onChanged={refreshAll}
        />
      )}
    </div>
  );
};

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <Card>
    <CardContent className="p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </CardContent>
  </Card>
);

const Loader = () => (
  <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
);

const EmptyState = ({ text }: { text: string }) => (
  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</div>
);

/* ================= Выпуск документов ================= */

const IssueDocumentDialog = ({
  templates, routes, onCreated,
}: { templates: KedoTemplate[]; routes: KedoRoute[]; onCreated: () => void }) => {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [routeId, setRouteId] = useState<string>("none");
  const [scopeType, setScopeType] = useState<KedoScopeType>("user");
  const [scopeRef, setScopeRef] = useState("");
  const [userIds, setUserIds] = useState<string[]>([]);
  const [send, setSend] = useState(true);
  const { data: employees = [] } = useEmployees();

  const departments = useMemo(
    () => Array.from(new Set(employees.map((e) => e.department).filter(Boolean))) as string[],
    [employees],
  );

  const mutation = useMutation({
    mutationFn: () =>
      kedo.bulkCreate({
        template_id: templateId,
        scope_type: scopeType,
        user_ids: scopeType === "user" ? userIds : undefined,
        scope_ref: scopeType === "department" ? scopeRef : null,
        route_id: routeId === "none" ? null : routeId,
        send,
      }),
    onSuccess: (res) => {
      toast.success(`Создано документов: ${res.created}`);
      setOpen(false);
      setUserIds([]);
      onCreated();
    },
    onError: (e: any) => toast.error(e?.message || "Не удалось создать документы"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> Выпустить документ</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Выпуск документа</DialogTitle>
          <DialogDescription>Шаблон подставит данные сотрудника и отправит документ по маршруту.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Шаблон</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Выберите шаблон" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Маршрут</Label>
            <Select value={routeId} onValueChange={setRouteId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Из шаблона / подпись сотрудника</SelectItem>
                {routes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Кому</Label>
            <Select value={scopeType} onValueChange={(v) => setScopeType(v as KedoScopeType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Выбранным сотрудникам</SelectItem>
                <SelectItem value="department">Отделу / подразделению</SelectItem>
                <SelectItem value="company">Всей компании</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scopeType === "department" && (
            <Select value={scopeRef} onValueChange={setScopeRef}>
              <SelectTrigger><SelectValue placeholder="Выберите подразделение" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {departments.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
              </SelectContent>
            </Select>
          )}

          {scopeType === "user" && (
            <ScrollArea className="h-52 rounded-md border p-2">
              <div className="space-y-1">
                {employees.map((e) => (
                  <label key={e.user_id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                    <Checkbox
                      checked={userIds.includes(e.user_id)}
                      onCheckedChange={(c) =>
                        setUserIds((prev) => (c ? [...prev, e.user_id] : prev.filter((id) => id !== e.user_id)))
                      }
                    />
                    <span className="flex-1">{e.full_name || e.user_id}</span>
                    <span className="text-xs text-muted-foreground">{e.department}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={send} onCheckedChange={(c) => setSend(Boolean(c))} />
            Сразу отправить на подписание
          </label>
        </div>

        <DialogFooter>
          <Button
            disabled={!templateId || mutation.isPending || (scopeType === "user" && userIds.length === 0)}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Выпустить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ================= Шаблон ================= */

const TemplateDialog = ({
  template, routes, onSaved,
}: { template?: KedoTemplate; routes: KedoRoute[]; onSaved: () => void }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(template?.title ?? "");
  const [category, setCategory] = useState(template?.category ?? "other");
  const [signatureKind, setSignatureKind] = useState(template?.signature_kind ?? "pep");
  const [routeId, setRouteId] = useState(template?.route_id ?? "none");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!template) return;
    try {
      const full = await kedo.getTemplate(template.id);
      setBody(full.body_html ?? "");
    } catch { /* ignore */ }
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload: any = {
        title, category, signature_kind: signatureKind,
        route_id: routeId === "none" ? null : routeId,
        body_html: body,
      };
      if (template) await kedo.updateTemplate(template.id, payload);
      else await kedo.createTemplate(payload);
      toast.success(template?.is_system ? "Создана копия шаблона для компании" : "Шаблон сохранён");
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Не удалось сохранить шаблон");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) load(); }}>
      <DialogTrigger asChild>
        {template
          ? <Button variant="outline" size="sm">Открыть</Button>
          : <Button><Plus className="h-4 w-4 mr-1" /> Новый шаблон</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? template.title : "Новый шаблон"}</DialogTitle>
          <DialogDescription>
            Доступные плейсхолдеры: {"{{employee.full_name}}, {{employee.position}}, {{employee.department}}, {{employee.hire_date}}, {{date}}"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Категория</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(KEDO_CATEGORY_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Тип подписи</Label>
              <Select value={signatureKind} onValueChange={(v) => setSignatureKind(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pep">ПЭП</SelectItem>
                  <SelectItem value="ukep">УКЭП</SelectItem>
                  <SelectItem value="any">Любая</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Маршрут</Label>
              <Select value={routeId ?? "none"} onValueChange={setRouteId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без маршрута</SelectItem>
                  {routes.map((r) => (<SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Текст документа (HTML)</Label>
            <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />
          </div>
          {template?.is_system && (
            <p className="text-xs text-muted-foreground">
              Системный шаблон нельзя изменить — при сохранении будет создана копия для вашей компании.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={busy || !title.trim()}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ================= Маршрут ================= */

const RouteDialog = ({ route, onSaved }: { route?: KedoRoute; onSaved: () => void }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(route?.title ?? "");
  const [description, setDescription] = useState(route?.description ?? "");
  const [steps, setSteps] = useState<KedoRouteStep[]>(route?.steps ?? []);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (route) await kedo.updateRoute(route.id, { title, description, steps });
      else await kedo.createRoute({ title, description, steps });
      toast.success("Маршрут сохранён");
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Не удалось сохранить маршрут");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {route
          ? <Button variant="outline" size="sm">Редактировать</Button>
          : <Button><Plus className="h-4 w-4 mr-1" /> Новый маршрут</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{route ? "Маршрут" : "Новый маршрут"}</DialogTitle>
          <DialogDescription>Шаги выполняются по порядку: согласование, подписание, ознакомление.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Описание</Label>
            <Input value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <ScrollArea className="max-h-[50vh] pr-2">
            <RouteBuilder steps={steps} onChange={setSteps} />
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={busy || !title.trim()}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ================= Карточка документа ================= */

export const DocumentDialog = ({
  documentId, onClose, onChanged,
}: { documentId: string; onClose: () => void; onChanged: () => void }) => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["kedo.document", documentId],
    queryFn: () => kedo.getDocument(documentId),
  });
  const { data: eventsRes } = useQuery({
    queryKey: ["kedo.events", documentId],
    queryFn: () => kedo.events(documentId),
  });
  const [verify, setVerify] = useState<null | { ok: boolean; events: number }>(null);

  const doc = data?.document;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ["kedo.document", documentId] });
      qc.invalidateQueries({ queryKey: ["kedo.events", documentId] });
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Не удалось выполнить действие");
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {isLoading || !doc ? <Loader /> : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                {doc.title}
                <Badge variant={STATUS_VARIANT[doc.status] ?? "outline"}>{KEDO_STATUS_LABELS[doc.status]}</Badge>
              </DialogTitle>
              <DialogDescription>
                {doc.employee_name} · № {doc.number} · хранение до {doc.retention_until}
              </DialogDescription>
            </DialogHeader>

            <div
              className="prose prose-sm dark:prose-invert max-w-none rounded-md border p-3"
              dangerouslySetInnerHTML={{ __html: doc.body_html ?? "" }}
            />

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Маршрут</h4>
              {(data?.participants ?? []).map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">Шаг {p.step_order}</Badge>
                  <span className="flex-1">{p.name || p.user_id} — {KEDO_ACTION_LABELS[p.action]}</span>
                  <span className="text-xs text-muted-foreground">{p.status === "done" ? "выполнено" : p.status === "rejected" ? "отклонено" : "ожидает"}</span>
                </div>
              ))}
            </div>

            {(data?.signatures ?? []).length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Подписи</h4>
                {data!.signatures.map((s) => (
                  <div key={s.id} className="text-xs text-muted-foreground">
                    {s.kind.toUpperCase()} · {s.name} · {s.signed_at} · IP {s.ip} · hash {String(s.doc_hash).slice(0, 12)}…
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold flex-1">Журнал (hash chain)</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const res = await kedo.verify(documentId);
                    setVerify(res);
                    toast[res.ok ? "success" : "error"](
                      res.ok ? `Целостность подтверждена: ${res.events} событий` : "Цепочка нарушена",
                    );
                  }}
                >
                  <ShieldCheck className="h-4 w-4 mr-1" /> Проверить целостность
                </Button>
              </div>
              {verify && (
                <p className={`text-xs ${verify.ok ? "text-primary" : "text-destructive"}`}>
                  {verify.ok ? "Все события подтверждены." : "Обнаружено нарушение цепочки."}
                </p>
              )}
              <ScrollArea className="h-40 rounded-md border p-2">
                {(eventsRes?.data ?? []).map((e) => (
                  <div key={e.id} className="text-xs text-muted-foreground py-0.5">
                    {e.created_at} · {e.event} {e.actor_name ? `· ${e.actor_name}` : ""} · {e.hash.slice(0, 10)}…
                  </div>
                ))}
              </ScrollArea>
            </div>

            <DialogFooter className="gap-2">
              {doc.status === "draft" && (
                <Button onClick={() => act(() => kedo.send(documentId), "Документ отправлен")}>
                  <Send className="h-4 w-4 mr-1" /> Отправить на подписание
                </Button>
              )}
              {doc.status !== "signed" && doc.status !== "cancelled" && (
                <Button variant="outline" onClick={() => act(() => kedo.cancel(documentId), "Документ аннулирован")}>
                  <XCircle className="h-4 w-4 mr-1" /> Аннулировать
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* ================= ГИС ЭДО ================= */

const EdoTab = ({ documents }: { documents: KedoDocument[] }) => {
  const qc = useQueryClient();
  const { data: connRes } = useQuery({ queryKey: ["kedo.edo.connections"], queryFn: kedo.listEdoConnections });
  const { data: dispRes } = useQuery({ queryKey: ["kedo.edo.dispatches"], queryFn: kedo.listDispatches });
  const [provider, setProvider] = useState<"sfr" | "fns" | "diadoc" | "nobel">("sfr");
  const [title, setTitle] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [connId, setConnId] = useState("");

  const signed = documents.filter((d) => d.status === "signed");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Подключения</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <Select value={provider} onValueChange={(v) => setProvider(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sfr">СФР</SelectItem>
                <SelectItem value="fns">ФНС</SelectItem>
                <SelectItem value="diadoc">Контур.Диадок</SelectItem>
                <SelectItem value="nobel">Нобель</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
            <Button
              disabled={!title.trim()}
              onClick={async () => {
                await kedo.createEdoConnection({ provider, title, endpoint });
                setTitle(""); setEndpoint("");
                qc.invalidateQueries({ queryKey: ["kedo.edo.connections"] });
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Добавить
            </Button>
          </div>

          {(connRes?.data ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm border rounded-md p-2">
              <Badge variant="outline">{c.provider.toUpperCase()}</Badge>
              <span className="flex-1">{c.title}</span>
              <span className="text-xs text-muted-foreground">{c.endpoint}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  await kedo.deleteEdoConnection(c.id);
                  qc.invalidateQueries({ queryKey: ["kedo.edo.connections"] });
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Отправка подписанных документов</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={connId} onValueChange={setConnId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Подключение" /></SelectTrigger>
              <SelectContent>
                {(connRes?.data ?? []).map((c) => (<SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button
              disabled={!connId || signed.length === 0}
              onClick={async () => {
                const res = await kedo.dispatchToEdo(connId, signed.map((d) => d.id));
                toast.success(`В очередь поставлено: ${res.queued}`);
                qc.invalidateQueries({ queryKey: ["kedo.edo.dispatches"] });
              }}
            >
              <Send className="h-4 w-4 mr-1" /> Отправить {signed.length} подписанных
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Обмен с ГИС ЭДО подключается после выбора оператора: сейчас формируется очередь и журнал отправок.
          </p>
          <ScrollArea className="h-48 rounded-md border p-2">
            {(dispRes?.data ?? []).map((d) => (
              <div key={d.id} className="text-xs text-muted-foreground py-0.5">
                {d.created_at} · {d.title} · {d.status} · {d.message}
              </div>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default Kedo;
