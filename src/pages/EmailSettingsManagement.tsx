import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Send, ShieldCheck, Loader2, AlertTriangle, PlugZap, Database, FileCode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { laravel } from "@/integrations/laravel/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "@/lib/dateLocale";

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

interface SmtpPreflightResult {
  ok: boolean;
  host?: string;
  port?: number;
  encryption?: "ssl" | "tls" | "none" | null;
  username?: string | null;
}

interface EffectiveSource {
  source: "database" | "file" | "env";
  label: string;
  host: string | null;
  username: string | null;
  from_address: string | null;
  has_usable_password: boolean;
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
  const host = next.host.trim().toLowerCase() === "smtp.yandex.com" || next.provider === "yandex" ? "smtp.yandex.ru" : next.host.trim();
  return host.toLowerCase() === "smtp.yandex.ru"
    ? { ...next, host, port: 465, encryption: "ssl" as const, username: next.username.trim(), password: next.password.replace(/[\s\u00A0\u200B-\u200D\uFEFF]+/g, "") }
    : { ...next, host };
};

const EmailSettingsManagement = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation("admin");
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
      toast.success(t("emailSettings.toastSaved"));
    },
    onError: (e: any) => toast.error(e.message || t("emailSettings.toastSaveFail")),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await laravel.post<{ ok: boolean; setting: EmailSetting }>("/admin/email-settings/test", { to: testTo });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_settings"] });
      toast.success(t("emailSettings.toastTestSent"));
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ["email_settings"] });
      toast.error(e.message || t("emailSettings.toastTestFail"));
    },
  });

  const preflightMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await laravel.post<SmtpPreflightResult>("/admin/email-settings/preflight");
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (result) => {
      toast.success(`SMTP handshake OK: ${result?.host}:${result?.port}`);
    },
    onError: (e: any) => toast.error(e.message || t("emailSettings.toastHandshakeFail")),
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
          <h1 className="text-2xl font-bold text-foreground">{t("emailSettings.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("emailSettings.subtitle")}</p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${setting?.is_active ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {setting?.is_active ? <ShieldCheck className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {setting?.is_active ? t("emailSettings.statusActive") : t("emailSettings.statusInactive")}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Mail className="w-5 h-5 text-primary" /> {t("emailSettings.smtpCardTitle")}</CardTitle>
          <CardDescription>{t("emailSettings.smtpCardDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t("emailSettings.labelProvider")}</Label>
              <Select value={form.provider} onValueChange={applyPreset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(presets).map(([value, preset]) => <SelectItem key={value} value={value}>{preset.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{t("emailSettings.labelHint")}</Label>
              <div className="min-h-10 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{selectedPreset?.hint || t("emailSettings.hintDefault")}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2 md:col-span-2"><Label>Host</Label><Input value={form.host} onChange={(e) => setForm(normalizeYandexSmtp({ ...form, host: e.target.value }))} placeholder="smtp.example.com" /></div>
            <div className="space-y-2"><Label>Port</Label><Input type="number" value={form.port} onChange={(e) => setForm(normalizeYandexSmtp({ ...form, port: Number(e.target.value) }))} /></div>
            <div className="space-y-2">
              <Label>{t("emailSettings.labelEncryption")}</Label>
              <Select value={form.encryption} onValueChange={(v: "ssl" | "tls" | "none") => setForm(normalizeYandexSmtp({ ...form, encryption: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="tls">TLS</SelectItem><SelectItem value="ssl">SSL</SelectItem><SelectItem value="none">{t("emailSettings.encryptionNone")}</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t("emailSettings.labelLogin")}</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="mail@example.com" /></div>
            <div className="space-y-2"><Label>{setting?.has_password ? t("emailSettings.labelPasswordNoChange") : t("emailSettings.labelPassword")}</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2"><Label>From address</Label><Input type="email" value={form.from_address} onChange={(e) => setForm({ ...form, from_address: e.target.value })} placeholder="no-reply@example.com" /></div>
            <div className="space-y-2"><Label>From name</Label><Input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Reply-To</Label><Input type="email" value={form.reply_to_address} onChange={(e) => setForm({ ...form, reply_to_address: e.target.value })} placeholder="support@example.com" /></div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 p-4">
            <div><p className="text-sm font-medium text-foreground">{t("emailSettings.labelSystemEmails")}</p><p className="text-xs text-muted-foreground">{t("emailSettings.systemEmailsDesc")}</p></div>
            <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
          </div>

          {setting?.last_tested_at && (
            <div className={`rounded-lg p-3 text-sm ${setting.last_test_error ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
              {setting.last_test_error ? setting.last_test_error : `OK: ${new Date(setting.last_tested_at).toLocaleString(getIntlLocale())}`}
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between border-t border-border pt-5">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {t("emailSettings.saveSmtp")}
            </Button>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Button variant="outline" onClick={() => preflightMutation.mutate()} disabled={preflightMutation.isPending || !setting}>
                {preflightMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />} {t("emailSettings.checkConnection")}
              </Button>
              <Input className="sm:w-72" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={t("emailSettings.testEmailPlaceholder")} />
              <Button variant="secondary" onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !setting}>
                {testMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {t("emailSettings.sendTest")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailSettingsManagement;
