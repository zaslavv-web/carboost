/**
 * Волна 6: Интеграции.
 *
 * Управление вебхуками компании (подписка на события платформы)
 * + iCal-URL для подписки Google/Outlook/Apple Calendar на отсутствия команды.
 *
 * Доступ — HRD/company_admin/superadmin.
 */
import { useEffect, useState } from "react";
import { laravel } from "@/integrations/laravel/client";
import { toast } from "sonner";
import {
  Copy, Plus, Trash2, Send, Loader2, Webhook, CalendarDays, Check, X, RefreshCw,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

type Subscription = {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  last_delivery_at?: string | null;
  last_delivery_status?: string | null;
};

export default function Integrations() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [icalUrl, setIcalUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", events: [] as string[] });
  const [freshSecret, setFreshSecret] = useState<{ id: string; secret: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const [s, e, u] = await Promise.all([
      laravel.get<Subscription[]>("/webhooks"),
      laravel.get<{ events: string[] }>("/webhooks/events"),
      laravel.get<{ url: string }>("/integrations/ical/leaves-url"),
    ]);
    setSubs(s.data ?? []);
    setEvents(e.data?.events ?? []);
    setIcalUrl(u.data?.url ?? "");
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Скопировано");
  };

  const createSubscription = async () => {
    if (!form.name || !form.url || form.events.length === 0) {
      toast.error("Заполните имя, URL и хотя бы одно событие");
      return;
    }
    setCreating(true);
    const { data, error } = await laravel.post<any>("/webhooks", { ...form, is_active: true });
    setCreating(false);
    if (error) return toast.error(error.message);
    setFreshSecret({ id: data.id, secret: data.secret });
    setOpenDialog(false);
    setForm({ name: "", url: "", events: [] });
    load();
  };

  const toggle = async (s: Subscription) => {
    await laravel.patch(`/webhooks/${s.id}`, { is_active: !s.is_active });
    load();
  };

  const remove = async (s: Subscription) => {
    if (!confirm(`Удалить подписку «${s.name}»?`)) return;
    await laravel.delete(`/webhooks/${s.id}`);
    load();
  };

  const test = async (s: Subscription) => {
    const { error } = await laravel.post(`/webhooks/${s.id}/test`, {});
    if (error) toast.error(error.message);
    else toast.success("Тестовый ping отправлен");
    setTimeout(load, 800);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-3xl font-serif">Интеграции</h1>
        <p className="text-sm text-muted-foreground">
          Вебхуки для внешних систем и подписка на календарь отсутствий.
        </p>
      </header>

      {/* iCal calendar subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Календарь отсутствий (iCal)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Подпишите Google Calendar / Outlook / Apple Calendar на согласованные отсутствия
            команды. Ссылка защищена HMAC-подписью и обновляется автоматически.
          </p>
          <div className="flex gap-2">
            <Input value={icalUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(icalUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            Вебхуки ({subs.length})
          </CardTitle>
          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Новый вебхук</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Новая подписка на события</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Имя</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Slack #hr-events"
                  />
                </div>
                <div>
                  <Label>URL</Label>
                  <Input
                    value={form.url}
                    onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                    placeholder="https://hooks.example.com/growthpeak"
                  />
                </div>
                <div>
                  <Label>События</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2 max-h-56 overflow-auto p-2 border rounded-md">
                    {events.map((ev) => (
                      <label key={ev} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={form.events.includes(ev)}
                          onCheckedChange={(v) =>
                            setForm((f) => ({
                              ...f,
                              events: v
                                ? [...f.events, ev]
                                : f.events.filter((x) => x !== ev),
                            }))
                          }
                        />
                        <span className="font-mono text-xs">{ev}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenDialog(false)}>Отмена</Button>
                <Button onClick={createSubscription} disabled={creating}>
                  {creating && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Создать
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-2">
          {subs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Подписок пока нет. Добавьте вебхук, чтобы получать события платформы в Slack, Bitrix,
              CRM или собственный сервис.
            </p>
          )}
          {subs.map((s) => (
            <div key={s.id} className="p-3 border rounded-md flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  {s.is_active ? (
                    <Badge variant="outline" className="text-green-600 border-green-600/40">
                      <Check className="h-3 w-3 mr-1" /> Активна
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      <X className="h-3 w-3 mr-1" /> Отключена
                    </Badge>
                  )}
                  {s.last_delivery_status === "ok" && (
                    <Badge variant="outline" className="text-xs">last: ok</Badge>
                  )}
                  {s.last_delivery_status === "error" && (
                    <Badge variant="destructive" className="text-xs">last: error</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate font-mono">{s.url}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {s.events.slice(0, 4).join(", ")}
                  {s.events.length > 4 && ` +${s.events.length - 4}`}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => test(s)} title="Отправить ping">
                <Send className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => toggle(s)} title="Вкл/выкл">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => remove(s)} title="Удалить">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Fresh secret modal */}
      <Dialog open={!!freshSecret} onOpenChange={(v) => !v && setFreshSecret(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Секрет подписки</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Сохраните секрет — он показывается только один раз. Используйте его для проверки
            подписи в заголовке <code>X-GrowthPeak-Signature</code> (HMAC-SHA256 от тела запроса).
          </p>
          <div className="flex gap-2">
            <Input readOnly value={freshSecret?.secret ?? ""} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(freshSecret?.secret ?? "")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
