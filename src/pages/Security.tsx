import { useEffect, useMemo, useState } from "react";
import {
  security,
  AUDIT_SEVERITY_LABELS,
  PERMISSION_LABELS,
  type AuditEvent,
  type CustomRole,
  type ScimToken,
  type SecurityPolicy,
  type SsoProvider,
} from "@/integrations/laravel/security";
import TwoFactorCard from "@/components/security/TwoFactorCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Download, KeyRound, Loader2, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { laravelAuth } from "@/integrations/laravel/client";

const ROLE_OPTIONS = [
  { value: "employee", label: "Сотрудник" },
  { value: "manager", label: "Руководитель" },
  { value: "hr", label: "HR" },
  { value: "hrd", label: "HRD" },
  { value: "company_admin", label: "Администратор компании" },
];

const emptyProvider: Partial<SsoProvider> = {
  kind: "oidc",
  title: "",
  domain_hint: "",
  is_active: true,
  jit_provisioning: true,
  default_role: "employee",
  scopes: "openid email profile",
};

const Security = () => {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof security.stats>> | null>(null);

  // SSO
  const [providers, setProviders] = useState<SsoProvider[]>([]);
  const [endpoints, setEndpoints] = useState<Record<string, string>>({});
  const [providerDialog, setProviderDialog] = useState(false);
  const [providerDraft, setProviderDraft] = useState<Partial<SsoProvider>>(emptyProvider);

  // SCIM
  const [tokens, setTokens] = useState<ScimToken[]>([]);
  const [scimBase, setScimBase] = useState("");
  const [newTokenName, setNewTokenName] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  // Политики
  const [policy, setPolicy] = useState<SecurityPolicy | null>(null);
  const [ipText, setIpText] = useState("");

  // Аудит
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [auditSeverity, setAuditSeverity] = useState<string>("all");
  const [auditSearch, setAuditSearch] = useState("");

  // RBAC
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roleDialog, setRoleDialog] = useState(false);
  const [roleDraft, setRoleDraft] = useState<Partial<CustomRole>>({ base_role: "employee", permissions: [] });

  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    try {
      const [s, p, t, pol, r] = await Promise.all([
        security.stats(),
        security.listProviders(),
        security.listScimTokens(),
        security.getPolicy(),
        security.listRoles(),
      ]);
      setStats(s);
      setProviders(p.data ?? []);
      setEndpoints(p.endpoints ?? {});
      setTokens(t.data ?? []);
      setScimBase(t.base_url ?? "");
      setPolicy(pol);
      setIpText((pol.ip_allowlist ?? []).join("\n"));
      setRoles(r.data ?? []);
      setPermissions(r.permissions ?? []);
    } catch (e: any) {
      toast.error(e.message || "Не удалось загрузить настройки безопасности");
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async () => {
    try {
      const res = await security.listAudit({
        severity: auditSeverity === "all" ? undefined : auditSeverity,
        search: auditSearch || undefined,
        limit: 200,
      });
      setEvents(res.data ?? []);
    } catch (e: any) {
      toast.error(e.message || "Не удалось загрузить журнал");
    }
  };

  useEffect(() => { void loadAll(); }, []);
  useEffect(() => { void loadAudit(); }, [auditSeverity]);

  const twofaCoverage = useMemo(() => {
    if (!stats || !stats.users_total) return 0;
    return Math.round((stats.users_2fa / stats.users_total) * 100);
  }, [stats]);

  const saveProvider = async () => {
    try {
      if (providerDraft.id) {
        await security.updateProvider(providerDraft.id, providerDraft);
      } else {
        await security.createProvider(providerDraft);
      }
      setProviderDialog(false);
      setProviderDraft(emptyProvider);
      toast.success("Провайдер сохранён");
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Ошибка сохранения");
    }
  };

  const savePolicy = async () => {
    if (!policy) return;
    try {
      await security.updatePolicy({
        ...policy,
        ip_allowlist: ipText.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      toast.success("Политика обновлена");
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Ошибка сохранения");
    }
  };

  const createToken = async () => {
    if (!newTokenName.trim()) return;
    try {
      const res = await security.createScimToken(newTokenName.trim());
      setIssuedToken(res.token);
      setNewTokenName("");
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Ошибка создания токена");
    }
  };

  const saveRole = async () => {
    try {
      if (roleDraft.id) await security.updateRole(roleDraft.id, roleDraft);
      else await security.createRole(roleDraft);
      setRoleDialog(false);
      setRoleDraft({ base_role: "employee", permissions: [] });
      toast.success("Роль сохранена");
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Ошибка сохранения роли");
    }
  };

  const exportAudit = async (format: "csv" | "jsonl" | "cef") => {
    try {
      const res = await fetch(security.auditExportUrl(format), {
        headers: { Authorization: `Bearer ${laravelAuth.getToken() ?? ""}` },
      });
      if (!res.ok) throw new Error("Сервер отклонил выгрузку");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit.${format === "cef" ? "log" : format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message || "Не удалось выгрузить журнал");
    }
  };

  const togglePermission = (perm: string) => {
    const current = roleDraft.permissions ?? [];
    setRoleDraft({
      ...roleDraft,
      permissions: current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm],
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-serif">Безопасность</h1>
        <p className="text-muted-foreground text-sm">
          Корпоративный вход (SAML/OIDC), автопровижининг SCIM, двухфакторная аутентификация,
          журнал событий и кастомные роли доступа.
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">SSO-провайдеры</p>
          <p className="text-2xl font-semibold">{stats?.providers ?? 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Покрытие 2FA</p>
          <p className="text-2xl font-semibold">{twofaCoverage}%</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">События за 30 дней</p>
          <p className="text-2xl font-semibold">{stats?.events_30d ?? 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Кастомные роли</p>
          <p className="text-2xl font-semibold">{stats?.roles ?? 0}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="sso">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="sso">SSO</TabsTrigger>
          <TabsTrigger value="scim">SCIM</TabsTrigger>
          <TabsTrigger value="policy">Политики</TabsTrigger>
          <TabsTrigger value="audit">Аудит</TabsTrigger>
          <TabsTrigger value="roles">Роли</TabsTrigger>
          <TabsTrigger value="my2fa">Моя 2FA</TabsTrigger>
        </TabsList>

        {/* ---------------- SSO ---------------- */}
        <TabsContent value="sso" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setProviderDraft(emptyProvider); setProviderDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Добавить провайдера
            </Button>
          </div>

          {providers.length === 0 && (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">
              Провайдеры не настроены. Добавьте OIDC (Keycloak, Azure AD, Яндекс 360) или SAML 2.0.
            </CardContent></Card>
          )}

          {providers.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {p.title}
                      <Badge variant="outline">{p.kind.toUpperCase()}</Badge>
                      {!p.is_active && <Badge variant="secondary">выключен</Badge>}
                    </CardTitle>
                    <CardDescription>
                      Домен: {p.domain_hint || "—"} · Роль по умолчанию: {p.default_role}
                      {p.last_login_at ? ` · Последний вход: ${new Date(p.last_login_at).toLocaleString("ru-RU")}` : ""}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setProviderDraft(p); setProviderDialog(true); }}>
                      Настроить
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={async () => {
                        if (!confirm("Удалить провайдера?")) return;
                        await security.deleteProvider(p.id);
                        await loadAll();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1 font-mono break-all">
                <div>ACS / Callback: {(endpoints.acs || "").replace("{id}", p.id)}</div>
                <div>Метаданные SP: {(endpoints.metadata || "").replace("{id}", p.id)}</div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ---------------- SCIM ---------------- */}
        <TabsContent value="scim" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SCIM 2.0 endpoint</CardTitle>
              <CardDescription>Укажите этот адрес в IdP и выпустите токен доступа.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input readOnly value={scimBase} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(scimBase); toast.success("Скопировано"); }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Input value={newTokenName} onChange={(e) => setNewTokenName(e.target.value)} placeholder="Название токена (например, Azure AD)" />
                <Button onClick={createToken}><KeyRound className="h-4 w-4 mr-2" /> Выпустить</Button>
              </div>
            </CardContent>
          </Card>

          {issuedToken && (
            <Card className="border-primary">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium">Токен показывается один раз — скопируйте его сейчас.</p>
                <div className="flex gap-2">
                  <Input readOnly value={issuedToken} className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(issuedToken); toast.success("Скопировано"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setIssuedToken(null)}>Скрыть</Button>
              </CardContent>
            </Card>
          )}

          {tokens.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {t.token_prefix}… · {t.last_used_at ? `использован ${new Date(t.last_used_at).toLocaleString("ru-RU")}` : "не использовался"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {t.is_active ? <Badge>активен</Badge> : <Badge variant="secondary">отозван</Badge>}
                  {!!t.is_active && (
                    <Button variant="ghost" size="icon" onClick={async () => { await security.revokeScimToken(t.id); await loadAll(); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ---------------- Политики ---------------- */}
        <TabsContent value="policy" className="space-y-4">
          {policy && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Conditional access</CardTitle>
                <CardDescription>Требования ко входу и передача событий в SIEM.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <Label>Обязательная 2FA для ролей</Label>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {ROLE_OPTIONS.map((r) => (
                      <label key={r.value} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={policy.require_2fa_roles?.includes(r.value)}
                          onCheckedChange={(v) =>
                            setPolicy({
                              ...policy,
                              require_2fa_roles: v
                                ? [...(policy.require_2fa_roles ?? []), r.value]
                                : (policy.require_2fa_roles ?? []).filter((x) => x !== r.value),
                            })
                          }
                        />
                        {r.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>IP-allowlist (по одной сети в строке, CIDR)</Label>
                  <Textarea value={ipText} onChange={(e) => setIpText(e.target.value)} rows={4} placeholder="10.0.0.0/8" className="mt-1 font-mono text-xs" />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Тайм-аут сессии, минут (0 — без ограничения)</Label>
                    <Input
                      type="number" min={0} className="mt-1"
                      value={policy.session_timeout_minutes}
                      onChange={(e) => setPolicy({ ...policy, session_timeout_minutes: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Минимальная длина пароля</Label>
                    <Input
                      type="number" min={6} max={64} className="mt-1"
                      value={policy.password_min_length}
                      onChange={(e) => setPolicy({ ...policy, password_min_length: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">Только вход через SSO</p>
                    <p className="text-xs text-muted-foreground">Отключает вход по паролю для сотрудников компании.</p>
                  </div>
                  <Switch checked={policy.sso_only} onCheckedChange={(v) => setPolicy({ ...policy, sso_only: v })} />
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-[1fr_200px]">
                  <div>
                    <Label>SIEM webhook</Label>
                    <Input
                      className="mt-1" placeholder="https://siem.company.ru/hooks/hr"
                      value={policy.siem_webhook_url ?? ""}
                      onChange={(e) => setPolicy({ ...policy, siem_webhook_url: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Формат</Label>
                    <Select value={policy.siem_format} onValueChange={(v: "json" | "cef") => setPolicy({ ...policy, siem_format: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="json">JSON</SelectItem>
                        <SelectItem value="cef">CEF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button onClick={savePolicy}><ShieldCheck className="h-4 w-4 mr-2" /> Сохранить политику</Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------------- Аудит ---------------- */}
        <TabsContent value="audit" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={auditSeverity} onValueChange={setAuditSeverity}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все события</SelectItem>
                <SelectItem value="info">Информация</SelectItem>
                <SelectItem value="warning">Внимание</SelectItem>
                <SelectItem value="critical">Критичные</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="w-64" placeholder="Поиск по email"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadAudit()}
            />
            <Button variant="outline" onClick={loadAudit}>Найти</Button>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportAudit("csv")}><Download className="h-4 w-4 mr-2" />CSV</Button>
              <Button variant="outline" size="sm" onClick={() => exportAudit("jsonl")}>JSONL</Button>
              <Button variant="outline" size="sm" onClick={() => exportAudit("cef")}>CEF</Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0 divide-y">
              {events.length === 0 && <p className="p-6 text-sm text-muted-foreground">Событий нет.</p>}
              {events.map((e) => (
                <div key={e.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
                  <Badge variant={e.severity === "critical" ? "destructive" : e.severity === "warning" ? "default" : "outline"}>
                    {AUDIT_SEVERITY_LABELS[e.severity] ?? e.severity}
                  </Badge>
                  <span className="font-mono text-xs">{e.event}</span>
                  <span className="text-muted-foreground">{e.actor_email || e.user_id || "—"}</span>
                  <span className="text-muted-foreground text-xs">{e.ip}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {e.created_at ? new Date(e.created_at).toLocaleString("ru-RU") : ""}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Роли ---------------- */}
        <TabsContent value="roles" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setRoleDraft({ base_role: "employee", permissions: [] }); setRoleDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Создать роль
            </Button>
          </div>

          {roles.length === 0 && (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">
              Кастомных ролей нет. Создайте роль, чтобы выдать точечный набор прав поверх базовой роли.
            </CardContent></Card>
          )}

          {roles.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{r.title}</CardTitle>
                    <CardDescription>
                      {r.description || "—"} · базовая роль: {r.base_role} · участников: {r.members}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setRoleDraft(r); setRoleDialog(true); }}>Изменить</Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={async () => {
                        if (!confirm("Удалить роль?")) return;
                        await security.deleteRole(r.id);
                        await loadAll();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1">
                {(r.permissions ?? []).map((p) => (
                  <Badge key={p} variant="secondary">{PERMISSION_LABELS[p] ?? p}</Badge>
                ))}
                {(r.permissions ?? []).length === 0 && <span className="text-xs text-muted-foreground">Права не выбраны</span>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="my2fa">
          <TwoFactorCard />
        </TabsContent>
      </Tabs>

      {/* Диалог провайдера */}
      <Dialog open={providerDialog} onOpenChange={setProviderDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{providerDraft.id ? "Настройка провайдера" : "Новый SSO-провайдер"}</DialogTitle>
            <DialogDescription>Реквизиты берутся из административной консоли вашего IdP.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Тип</Label>
                <Select
                  value={providerDraft.kind ?? "oidc"}
                  onValueChange={(v: "oidc" | "saml") => setProviderDraft({ ...providerDraft, kind: v })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oidc">OIDC / OAuth 2.0</SelectItem>
                    <SelectItem value="saml">SAML 2.0</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Название</Label>
                <Input className="mt-1" value={providerDraft.title ?? ""} onChange={(e) => setProviderDraft({ ...providerDraft, title: e.target.value })} />
              </div>
              <div>
                <Label>Домен почты</Label>
                <Input className="mt-1" placeholder="company.ru" value={providerDraft.domain_hint ?? ""} onChange={(e) => setProviderDraft({ ...providerDraft, domain_hint: e.target.value })} />
              </div>
              <div>
                <Label>Роль по умолчанию</Label>
                <Select
                  value={(providerDraft.default_role as string) ?? "employee"}
                  onValueChange={(v) => setProviderDraft({ ...providerDraft, default_role: v })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Автосоздание пользователей (JIT)</p>
                <p className="text-xs text-muted-foreground">Создавать аккаунт при первом входе через IdP.</p>
              </div>
              <Switch
                checked={!!providerDraft.jit_provisioning}
                onCheckedChange={(v) => setProviderDraft({ ...providerDraft, jit_provisioning: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <p className="text-sm font-medium">Активен</p>
              <Switch checked={!!providerDraft.is_active} onCheckedChange={(v) => setProviderDraft({ ...providerDraft, is_active: v })} />
            </div>

            {providerDraft.kind === "saml" ? (
              <div className="space-y-3">
                <div><Label>IdP Entity ID</Label><Input className="mt-1" value={providerDraft.entity_id ?? ""} onChange={(e) => setProviderDraft({ ...providerDraft, entity_id: e.target.value })} /></div>
                <div><Label>SSO URL</Label><Input className="mt-1" value={providerDraft.sso_url ?? ""} onChange={(e) => setProviderDraft({ ...providerDraft, sso_url: e.target.value })} /></div>
                <div><Label>SLO URL</Label><Input className="mt-1" value={providerDraft.slo_url ?? ""} onChange={(e) => setProviderDraft({ ...providerDraft, slo_url: e.target.value })} /></div>
                <div><Label>Сертификат x509</Label><Textarea rows={5} className="mt-1 font-mono text-xs" value={providerDraft.x509_cert ?? ""} onChange={(e) => setProviderDraft({ ...providerDraft, x509_cert: e.target.value })} /></div>
              </div>
            ) : (
              <div className="space-y-3">
                <div><Label>Issuer</Label><Input className="mt-1" value={providerDraft.issuer ?? ""} onChange={(e) => setProviderDraft({ ...providerDraft, issuer: e.target.value })} /></div>
                <div><Label>Authorize URL</Label><Input className="mt-1" value={providerDraft.authorize_url ?? ""} onChange={(e) => setProviderDraft({ ...providerDraft, authorize_url: e.target.value })} /></div>
                <div><Label>Token URL</Label><Input className="mt-1" value={providerDraft.token_url ?? ""} onChange={(e) => setProviderDraft({ ...providerDraft, token_url: e.target.value })} /></div>
                <div><Label>Userinfo URL</Label><Input className="mt-1" value={providerDraft.userinfo_url ?? ""} onChange={(e) => setProviderDraft({ ...providerDraft, userinfo_url: e.target.value })} /></div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div><Label>Client ID</Label><Input className="mt-1" value={providerDraft.client_id ?? ""} onChange={(e) => setProviderDraft({ ...providerDraft, client_id: e.target.value })} /></div>
                  <div><Label>Client Secret</Label><Input className="mt-1" type="password" value={providerDraft.client_secret ?? ""} onChange={(e) => setProviderDraft({ ...providerDraft, client_secret: e.target.value })} /></div>
                </div>
                <div><Label>Scopes</Label><Input className="mt-1" value={providerDraft.scopes ?? ""} onChange={(e) => setProviderDraft({ ...providerDraft, scopes: e.target.value })} /></div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProviderDialog(false)}>Отмена</Button>
            <Button onClick={saveProvider} disabled={!providerDraft.title}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог роли */}
      <Dialog open={roleDialog} onOpenChange={setRoleDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{roleDraft.id ? "Изменение роли" : "Новая роль"}</DialogTitle>
            <DialogDescription>Права добавляются поверх базовой роли.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div><Label>Название</Label><Input className="mt-1" value={roleDraft.title ?? ""} onChange={(e) => setRoleDraft({ ...roleDraft, title: e.target.value })} /></div>
            <div><Label>Описание</Label><Input className="mt-1" value={roleDraft.description ?? ""} onChange={(e) => setRoleDraft({ ...roleDraft, description: e.target.value })} /></div>
            <div>
              <Label>Базовая роль</Label>
              <Select value={roleDraft.base_role ?? "employee"} onValueChange={(v) => setRoleDraft({ ...roleDraft, base_role: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="flex items-center gap-2"><Users className="h-4 w-4" /> Права</Label>
              <div className="grid gap-2 md:grid-cols-2 mt-2">
                {permissions.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={(roleDraft.permissions ?? []).includes(p)} onCheckedChange={() => togglePermission(p)} />
                    {PERMISSION_LABELS[p] ?? p}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(false)}>Отмена</Button>
            <Button onClick={saveRole} disabled={!roleDraft.title}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Security;
