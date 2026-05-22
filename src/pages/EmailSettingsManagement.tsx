import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Send, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { laravel } from "@/integrations/laravel/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface EmailSetting {
  id: string;
  provider: string;
  host: string;
  port: number;
  encryption: "ssl" | "tls" | "none";
  username: string;
  from_address: string;
  from_name: string;
  reply_to_address: string | null;
  is_active: boolean;
  has_password: boolean;
  last_tested_at: string | null;
  last_test_error: string | null;
}

type Presets = Record<string, { label: string; host: string; port: number; encryption: "ssl" | "tls" | "none"; hint: string }>;

const emptyForm = {
  provider: "custom",
  host: "",
  port: 587,
  encryption: "tls" as "ssl" | "tls" | "none",
  username: "",
  password: "",
  from_address: "",
  from_name: "Career Track",
  reply_to_address: "",
  is_active: true,
};

const normalizeYandexSmtp = (next: typeof emptyForm) => {
  const host = next.host.trim().toLowerCase() === "smtp.yandex.com" ? "smtp.yandex.ru" : next.host.trim();
  return host.toLowerCase() === "smtp.yandex.ru" && Number(next.port) === 465
    ? { ...next, host, encryption: "ssl" as const }
    : { ...next, host };
};

const EmailSettingsManagement = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [testTo, setTestTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["email_settings"],
    queryFn: async () => {
      const { data, error } = await laravel.get<{ setting: EmailSetting | null; presets: Presets }>("/admin/email-settings");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const setting = data?.setting;
  const presets = data?.presets ?? {};
  const selectedPreset = useMemo(() => presets[form.provider], [form.provider, presets]);

  useEffect(() => {
    if (!setting) return;
    setForm(normalizeYandexSmtp({
      provider: setting.provider || "custom",
      host: setting.host || "",
      port: setting.port || 587,
      encryption: setting.encryption || "tls",
      username: setting.username || "",
      password: "",
      from_address: setting.from_address || "",
      from_name: setting.from_name || "Career Track",
      reply_to_address: setting.reply_to_address || "",
      is_active: setting.is_active,
    }));
    setTestTo(setting.from_address || "");
  }, [setting]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...normalizeYandexSmtp(form), reply_to_address: form.reply_to_address || null };
      const { data, error } = await laravel.put<{ setting: EmailSetting }>("/admin/email-settings", payload);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_settings"] });
      setForm((prev) => ({ ...prev, password: "" }));
      toast.success("SMTP-настройки сохранены");
    },
    onError: (e: any) => toast.error(e.message || "Не удалось сохранить настройки"),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await laravel.post<{ ok: boolean; setting: EmailSetting }>("/admin/email-settings/test", { to: testTo });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_settings"] });
      toast.success("Тестовое письмо отправлено");
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ["email_settings"] });
      toast.error(e.message || "Тест SMTP не прошёл");
    },
  });

  const applyPreset = (provider: string) => {
    const preset = presets[provider];
    setForm((prev) => normalizeYandexSmtp({
      ...prev,
      provider,
      host: preset?.host ?? prev.host,
      port: preset?.port ?? prev.port,
      encryption: preset?.encryption ?? prev.encryption,
    }));
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Почтовый сервис</h1>
          <p className="text-sm text-muted-foreground mt-1">SMTP для системных писем, уведомлений и восстановления паролей</p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${setting?.is_active ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {setting?.is_active ? <ShieldCheck className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {setting?.is_active ? "Активно" : "Не активно"}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Mail className="w-5 h-5 text-primary" /> SMTP-подключение</CardTitle>
          <CardDescription>Пароль сохраняется в зашифрованном виде и не возвращается в интерфейс.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Провайдер</Label>
              <Select value={form.provider} onValueChange={applyPreset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(presets).map(([value, preset]) => <SelectItem key={value} value={value}>{preset.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Подсказка</Label>
              <div className="min-h-10 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{selectedPreset?.hint || "Введите параметры SMTP-сервера."}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2 md:col-span-2"><Label>Host</Label><Input value={form.host} onChange={(e) => setForm(normalizeYandexSmtp({ ...form, host: e.target.value }))} placeholder="smtp.example.com" /></div>
            <div className="space-y-2"><Label>Port</Label><Input type="number" value={form.port} onChange={(e) => setForm(normalizeYandexSmtp({ ...form, port: Number(e.target.value) }))} /></div>
            <div className="space-y-2">
              <Label>Шифрование</Label>
              <Select value={form.encryption} onValueChange={(v: "ssl" | "tls" | "none") => setForm(normalizeYandexSmtp({ ...form, encryption: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="tls">TLS</SelectItem><SelectItem value="ssl">SSL</SelectItem><SelectItem value="none">Без шифрования</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Логин</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="mail@example.com" /></div>
            <div className="space-y-2"><Label>Пароль {setting?.has_password ? "(оставьте пустым, чтобы не менять)" : ""}</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2"><Label>From address</Label><Input type="email" value={form.from_address} onChange={(e) => setForm({ ...form, from_address: e.target.value })} placeholder="no-reply@example.com" /></div>
            <div className="space-y-2"><Label>From name</Label><Input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Reply-To</Label><Input type="email" value={form.reply_to_address} onChange={(e) => setForm({ ...form, reply_to_address: e.target.value })} placeholder="support@example.com" /></div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 p-4">
            <div><p className="text-sm font-medium text-foreground">Использовать для системных писем</p><p className="text-xs text-muted-foreground">Применяется к восстановлению паролей, приглашениям и уведомлениям.</p></div>
            <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
          </div>

          {setting?.last_tested_at && (
            <div className={`rounded-lg p-3 text-sm ${setting.last_test_error ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
              {setting.last_test_error ? setting.last_test_error : `Последний тест успешен: ${new Date(setting.last_tested_at).toLocaleString("ru-RU")}`}
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between border-t border-border pt-5">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Сохранить SMTP
            </Button>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Input className="sm:w-72" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="email для теста" />
              <Button variant="secondary" onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !setting}>
                {testMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Отправить тест
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailSettingsManagement;
