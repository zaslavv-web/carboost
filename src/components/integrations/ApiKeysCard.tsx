/**
 * Ключи интеграционного API.
 *
 * Полный токен приходит с сервера один раз — при создании; в базе остаётся
 * только хеш. Поэтому показанный ключ нельзя открыть повторно, и карточка
 * явно предупреждает об этом.
 */
import { useEffect, useMemo, useState } from "react";
import { laravel } from "@/integrations/laravel/client";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Plus, ShieldOff, BookOpen } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

const emptyForm = { name: "", scopes: [] as string[], expires_at: "" };

export default function ApiKeysCard() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [list, meta] = await Promise.all([
      laravel.get<ApiKey[]>("/integrations/api-keys"),
      laravel.get<{ scopes: string[] }>("/integrations/api-keys/scopes"),
    ]);
    setKeys(list.data ?? []);
    setScopes(meta.data?.scopes ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Скоупы группируем по домену — плоский список из 25 чекбоксов нечитаем.
  const grouped = useMemo(() => {
    const byDomain: Record<string, string[]> = {};
    for (const scope of scopes) {
      const [domain] = scope.split(":");
      (byDomain[domain] ??= []).push(scope);
    }
    return Object.entries(byDomain).sort(([a], [b]) => a.localeCompare(b));
  }, [scopes]);

  const toggleScope = (scope: string) => {
    setForm((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }));
  };

  const create = async () => {
    if (!form.name.trim() || form.scopes.length === 0) {
      toast.error("Укажите название и хотя бы один скоуп");
      return;
    }
    setCreating(true);
    const { data, error } = await laravel.post<ApiKey & { token: string }>("/integrations/api-keys", {
      name: form.name.trim(),
      scopes: form.scopes,
      expires_at: form.expires_at || null,
    });
    setCreating(false);
    if (error) return toast.error(error.message);

    setFreshToken(data.token);
    setOpen(false);
    setForm(emptyForm);
    load();
  };

  const revoke = async (key: ApiKey) => {
    if (!confirm(`Отозвать ключ «${key.name}»? Внешние системы с ним сразу потеряют доступ.`)) return;
    const { error } = await laravel.delete(`/integrations/api-keys/${key.id}`);
    if (error) return toast.error(error.message);
    toast.success("Ключ отозван");
    load();
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Скопировано");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Ключи API
          </CardTitle>
          <CardDescription className="mt-1">
            Машинный доступ внешних систем к данным платформы — чтение и запись по выданным скоупам.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Создать ключ
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4 shrink-0" />
          <span>
            Описание ресурсов и событий:{" "}
            <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">/api/integration/v1/meta/resources</code>
            {"  "}
            <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">/api/integration/v1/openapi.json</code>
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Ключей пока нет. Создайте ключ, чтобы внешняя система могла читать и записывать данные.
          </p>
        ) : (
          <div className="space-y-2">
            {keys.map((key) => {
              const revoked = !!key.revoked_at;
              const expired = !!key.expires_at && new Date(key.expires_at) < new Date();
              return (
                <div
                  key={key.id}
                  className="flex items-start justify-between gap-4 rounded-lg border border-border p-3 flex-wrap"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{key.name}</span>
                      <code className="text-xs text-muted-foreground">gp_{key.prefix}_…</code>
                      {revoked && <Badge variant="destructive">Отозван</Badge>}
                      {!revoked && expired && <Badge variant="secondary">Истёк</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <Badge key={scope} variant="outline" className="text-[10px]">{scope}</Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {key.last_used_at
                        ? `Последнее обращение: ${new Date(key.last_used_at).toLocaleString()}`
                        : "Ещё не использовался"}
                      {key.expires_at && ` · Действует до ${new Date(key.expires_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  {!revoked && (
                    <Button variant="ghost" size="sm" onClick={() => revoke(key)}>
                      <ShieldOff className="h-4 w-4" /> Отозвать
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Создание ключа */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Новый ключ API</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Обмен с 1С:ЗУП"
              />
            </div>

            <div className="space-y-2">
              <Label>Действует до (необязательно)</Label>
              <Input
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Права доступа</Label>
              <p className="text-xs text-muted-foreground">
                Выдавайте только то, что действительно нужно интеграции.
              </p>
              <div className="max-h-64 overflow-y-auto space-y-3 rounded-lg border border-border p-3">
                {grouped.map(([domain, domainScopes]) => (
                  <div key={domain} className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase">{domain}</p>
                    <div className="flex flex-wrap gap-3">
                      {domainScopes.map((scope) => (
                        <label key={scope} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={form.scopes.includes(scope)}
                            onCheckedChange={() => toggleScope(scope)}
                          />
                          <span>{scope}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={create} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />} Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ключ показывается ровно один раз */}
      <Dialog open={!!freshToken} onOpenChange={() => setFreshToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ключ создан</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Скопируйте ключ сейчас — открыть его повторно нельзя, в базе хранится только хеш.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-secondary px-3 py-2 rounded break-all">{freshToken}</code>
            <Button size="sm" variant="outline" onClick={() => copy(freshToken ?? "")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setFreshToken(null)}>Готово</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
