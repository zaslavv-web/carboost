import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Brain, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { laravel } from "@/integrations/laravel/client";
import { useAiSettings, type AiSettings } from "@/hooks/useAiAvailability";

type Provider = "gemini" | "yandexgpt" | "gigachat" | "openai_compatible" | "internal_rag" | "disabled";

const PROVIDER_PRESETS: Record<Provider, { url: string; model: string; label: string; description: string }> = {
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-2.0-flash",
    label: "Google Gemini",
    description: "Облачный Gemini через OpenAI-совместимый endpoint. Требует выход в интернет.",
  },
  yandexgpt: {
    url: "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
    model: "yandexgpt-lite",
    label: "YandexGPT",
    description: "Yandex Cloud Foundation Models. Подходит для российских контуров.",
  },
  gigachat: {
    url: "https://gigachat.devices.sberbank.ru/api/v1/chat/completions",
    model: "GigaChat",
    label: "GigaChat (Сбер)",
    description: "GigaChat API от СберБанка. Доступен on-prem.",
  },
  openai_compatible: {
    url: "http://ollama:11434/v1/chat/completions",
    model: "qwen2.5:14b",
    label: "OpenAI-совместимый",
    description: "vLLM / Ollama / LM Studio / Azure OpenAI и любой другой OpenAI-совместимый API.",
  },
  internal_rag: {
    url: "http://ollama:11434/v1/chat/completions",
    model: "qwen2.5:14b",
    label: "Внутренний RAG (β)",
    description: "Локальная LLM + RAG по документам компании. Требует развёрнутый Ollama + Qdrant. Индексация — отдельный шаг.",
  },
  disabled: {
    url: "",
    model: "",
    label: "Отключён",
    description: "AI-функции недоступны. Пользователи увидят сообщение администратора. После N обращений админу придёт уведомление.",
  },
};

const PROVIDERS_ORDER: Provider[] = ["yandexgpt", "gigachat", "openai_compatible", "internal_rag", "gemini", "disabled"];

export default function AiSettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: loaded, isLoading } = useAiSettings();

  const [form, setForm] = useState<AiSettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [testResult, setTestResult] = useState<null | { ok: boolean; message: string; latency?: number }>(null);
  const [advancedMode, setAdvancedMode] = useState<boolean>(() => {
    try { return localStorage.getItem("ai_advanced_mode") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("ai_advanced_mode", advancedMode ? "1" : "0"); } catch {}
  }, [advancedMode]);

  useEffect(() => {
    if (loaded) setForm(loaded);
  }, [loaded]);

  const save = useMutation({
    mutationFn: async (payload: any) => laravel.put<AiSettings>("/ai-settings", payload),
    onSuccess: (res) => {
      if (res.error) {
        toast.error(res.error.message);
        return;
      }
      toast.success("Настройки AI сохранены");
      qc.invalidateQueries({ queryKey: ["ai-settings"] });
      setApiKey("");
    },
    onError: (e: any) => toast.error(e?.message || "Не удалось сохранить"),
  });

  const test = useMutation({
    mutationFn: async () => laravel.post<{ ok: boolean; latency_ms?: number; response_preview?: string; error?: string }>("/ai-settings/test", {}),
    onSuccess: (res) => {
      if (res.error) {
        setTestResult({ ok: false, message: res.error.message });
        return;
      }
      const d: any = res.data || {};
      setTestResult({
        ok: !!d.ok,
        latency: d.latency_ms,
        message: d.ok ? `Ответ: «${d.response_preview ?? "—"}»` : (d.error || "Не удалось получить ответ"),
      });
    },
  });

  if (isLoading || !form) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const provider = form.provider as Provider;
  const preset = PROVIDER_PRESETS[provider];
  const extra = (form.extra ?? {}) as Record<string, any>;

  const set = (patch: Partial<AiSettings>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const setExtra = (patch: Record<string, any>) => set({ extra: { ...extra, ...patch } });

  const onSave = () => {
    save.mutate({
      provider,
      model: form.model || preset.model,
      api_url: form.api_url || preset.url,
      api_key: apiKey || undefined, // не передаём если не меняли
      extra: form.extra,
      rag_enabled: form.rag_enabled,
      disabled_message: form.disabled_message,
      disabled_alert_threshold: form.disabled_alert_threshold,
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-3"><Brain className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-bold">AI-провайдер</h1>
          <p className="text-sm text-muted-foreground">
            По умолчанию используется протестированная нами модель. Менять провайдера и ключ нужно только для закрытого контура.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Конфигурация</CardTitle>
              <CardDescription>
                {advancedMode
                  ? "Расширенный режим: вы видите все параметры провайдера."
                  : "Базовый режим: всё работает на наших настройках. Включите расширенный режим, чтобы подключить свою модель."}
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-sm shrink-0">
              <Switch checked={advancedMode} onCheckedChange={setAdvancedMode} />
              <span className="text-muted-foreground">Расширенный режим</span>
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!advancedMode && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Всё уже настроено</AlertTitle>
              <AlertDescription>
                AI-функции работают с моделью по умолчанию. Если нужно подключить YandexGPT, GigaChat или локальную модель — включите расширенный режим.
              </AlertDescription>
            </Alert>
          )}

          {advancedMode && (
          <div>
            <Label>Провайдер</Label>
            <Select value={provider} onValueChange={(v) => {
              const p = v as Provider;
              const pr = PROVIDER_PRESETS[p];
              set({ provider: p, api_url: pr.url, model: pr.model });
            }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDERS_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>{PROVIDER_PRESETS[p].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">{preset.description}</p>
          </div>
          )}

          {advancedMode && provider !== "disabled" && (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>API URL</Label>
                  <Input
                    className="mt-1"
                    value={form.api_url ?? ""}
                    onChange={(e) => set({ api_url: e.target.value })}
                    placeholder={preset.url}
                  />
                </div>
                <div>
                  <Label>Модель</Label>
                  <Input
                    className="mt-1"
                    value={form.model ?? ""}
                    onChange={(e) => set({ model: e.target.value })}
                    placeholder={preset.model}
                  />
                </div>
              </div>

              <div>
                <Label>API ключ {form.api_key_set && <Badge variant="secondary" className="ml-2">сохранён</Badge>}</Label>
                <Input
                  className="mt-1"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={form.api_key_set ? "•••••••• (оставьте пустым, чтобы не менять)" : "Введите ключ"}
                />
                {provider === "gigachat" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Используйте «Authorization key» из личного кабинета GigaChat (base64(client_id:client_secret)).
                  </p>
                )}
              </div>

              {provider === "yandexgpt" && (
                <div>
                  <Label>folder_id</Label>
                  <Input
                    className="mt-1"
                    value={extra.folder_id ?? ""}
                    onChange={(e) => setExtra({ folder_id: e.target.value })}
                    placeholder="b1g..."
                  />
                </div>
              )}

              {provider === "gigachat" && (
                <div>
                  <Label>Scope</Label>
                  <Select value={extra.scope ?? "GIGACHAT_API_PERS"} onValueChange={(v) => setExtra({ scope: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GIGACHAT_API_PERS">PERS (физлица)</SelectItem>
                      <SelectItem value="GIGACHAT_API_B2B">B2B</SelectItem>
                      <SelectItem value="GIGACHAT_API_CORP">CORP (корпоративный)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {provider === "internal_rag" && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>RAG-индексация</AlertTitle>
                  <AlertDescription>
                    Полная индексация документов компании (HR-политики, позиции, треки) запускается отдельным шагом
                    после развёртывания. См. DEPLOYMENT_OFFLINE.md (готовится к поставке).
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}

          {provider === "disabled" && (
            <div className="space-y-4">
              <div>
                <Label>Сообщение пользователям</Label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  value={form.disabled_message ?? ""}
                  onChange={(e) => set({ disabled_message: e.target.value })}
                  placeholder="AI-функции временно недоступны. Обратитесь к администратору."
                />
              </div>
              <div>
                <Label>Порог уведомления администратора (обращений)</Label>
                <Input
                  className="mt-1 max-w-xs"
                  type="number"
                  min={1}
                  value={form.disabled_alert_threshold ?? 10}
                  onChange={(e) => set({ disabled_alert_threshold: Number(e.target.value) || 10 })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Когда пользователи нажмут AI-кнопки указанное число раз, всем Company Admin / HRD придёт уведомление.
                  Текущий счётчик: <strong>{form.disabled_request_count}</strong>.
                </p>
              </div>
            </div>
          )}

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onSave} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Сохранить
            </Button>
            <Button
              variant="outline"
              onClick={() => { setTestResult(null); test.mutate(); }}
              disabled={test.isPending || provider === "disabled"}
            >
              {test.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Проверить соединение
            </Button>
          </div>

          {testResult && (
            <Alert variant={testResult.ok ? "default" : "destructive"}>
              {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <AlertTitle>{testResult.ok ? "OK" : "Ошибка"}</AlertTitle>
              <AlertDescription>
                {testResult.message}
                {typeof testResult.latency === "number" && <span className="ml-2 text-xs">({testResult.latency} ms)</span>}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
