/**
 * Консоль приёма данных (поддомен api-in).
 *
 * Задача страницы — довести внешнюю систему до первой успешной записи. Поэтому
 * форма собирается из того же реестра, что и API: поля берутся из fields.write
 * ресурса, и отправить что-то, чего платформа не примет, здесь нельзя.
 *
 * Запись идёт через upsert по ключу внешней системы: повторная отправка того же
 * external_id обновляет запись, а не плодит дубликаты. Это же свойство делает
 * страницу безопасной для повторных нажатий.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, PlugZap, Send, ShieldAlert, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ConsoleHeader, ConsoleLayout, CopyButton, KeyField, ResultPanel,
} from "@/components/integration/ConsoleShell";
import {
  ApiResult, MetaResponse, ResourceMeta, callApi, curlSnippet, loadKey, saveKey,
} from "@/lib/integrationConsole";

const SYSTEM_STORAGE = "integration-console.system";

export default function InboundConsole() {
  const [key, setKey] = useState(loadKey);
  const [system, setSystem] = useState(() => {
    try {
      return sessionStorage.getItem(SYSTEM_STORAGE) ?? "";
    } catch {
      return "";
    }
  });
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setConnectError(null);
    const res = await callApi<MetaResponse>("/meta/resources", key);
    setConnecting(false);
    if (!res.ok) {
      setMeta(null);
      setConnectError(res.error);
      return;
    }
    saveKey(key);
    setMeta(res.data);
  }, [key]);

  useEffect(() => {
    if (loadKey()) void connect();
    // Однократно при монтировании — дальше подключение по кнопке.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (system) sessionStorage.setItem(SYSTEM_STORAGE, system);
    } catch {
      /* приватный режим */
    }
  }, [system]);

  const writable = (meta?.resources ?? []).filter(
    (r) => r.granted.write && r.operations.includes("update"),
  );

  return (
    <div className="min-h-screen bg-background">
      <ConsoleHeader
        title="Приём данных"
        subtitle="Подключите внешнюю систему и отправьте первую запись прямо отсюда — до того,
                  как писать код на своей стороне. Форма собирается из описания API, поэтому
                  отправить неподдерживаемое поле здесь невозможно."
      />

      <ConsoleLayout>
        <KeyField
          value={key}
          onChange={setKey}
          onConnect={connect}
          connecting={connecting}
          connected={!!meta}
        />

        {connectError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 flex items-start gap-3 text-sm">
              <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-destructive font-medium">Подключиться не удалось</p>
                <p className="text-muted-foreground mt-1">{connectError}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {meta && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <PlugZap className="h-4 w-4" />
                  Подключение внешней системы
                </CardTitle>
                <CardDescription>
                  Идентификатор системы — это пространство имён для ваших ключей. Записи,
                  загруженные под <code>1c_zup</code>, не пересекутся с записями под{" "}
                  <code>bitrix24</code>, даже если внутренние номера совпадают.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 max-w-md">
                  <Label htmlFor="system">Идентификатор системы</Label>
                  <Input
                    id="system"
                    value={system}
                    onChange={(e) => setSystem(e.target.value.replace(/\s+/g, "_").toLowerCase())}
                    placeholder="1c_zup"
                    className="font-mono"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground mr-1">Доступно на запись:</span>
                  {writable.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      ключу не выдан ни один скоуп записи
                    </span>
                  )}
                  {writable.map((r) => (
                    <Badge key={r.name} variant="outline">{r.name}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {writable.length > 0 && (
              <SendForm resources={writable} apiKey={key} system={system} />
            )}
          </>
        )}
      </ConsoleLayout>
    </div>
  );
}

function SendForm({
  resources,
  apiKey,
  system,
}: {
  resources: ResourceMeta[];
  apiKey: string;
  system: string;
}) {
  const [resourceName, setResourceName] = useState(resources[0]?.name ?? "");
  const [externalId, setExternalId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [rawMode, setRawMode] = useState(false);
  const [rawJson, setRawJson] = useState("{\n  \n}");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ApiResult<unknown> | null>(null);

  const resource = resources.find((r) => r.name === resourceName) ?? resources[0];

  // Смена ресурса обнуляет поля: набор колонок у ресурсов разный, и остатки
  // предыдущего заполнения молча ушли бы в запрос.
  useEffect(() => {
    setValues({});
    setResult(null);
  }, [resourceName]);

  const payload = useMemo(() => {
    if (rawMode) {
      try {
        const parsed = JSON.parse(rawJson);
        return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    // Пустые поля не отправляем: пустая строка затёрла бы значение в системе.
    return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""));
  }, [rawMode, rawJson, values]);

  const body = JSON.stringify(
    { external_system: system || "external", external_id: externalId || "<ВАШ_ID>", data: payload ?? {} },
    null,
    2,
  );

  const send = async () => {
    setJsonError(null);
    if (rawMode && payload === null) {
      setJsonError("JSON не разбирается — проверьте синтаксис");
      return;
    }
    if (!system.trim()) {
      setJsonError("Укажите идентификатор внешней системы выше");
      return;
    }
    if (!externalId.trim()) {
      setJsonError("Укажите идентификатор записи в вашей системе");
      return;
    }
    if (!payload || Object.keys(payload).length === 0) {
      setJsonError("Не заполнено ни одно поле");
      return;
    }

    setSending(true);
    setResult(
      await callApi(`/${resource.name}/upsert`, apiKey, {
        method: "POST",
        body: JSON.stringify({
          external_system: system.trim(),
          external_id: externalId.trim(),
          data: payload,
        }),
      }),
    );
    setSending(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Отправить данные в систему
        </CardTitle>
        <CardDescription>
          Повторная отправка с тем же идентификатором обновит ту же запись, а не создаст
          вторую — можно нажимать сколько угодно раз.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="target-resource">Куда загружаем</Label>
            <select
              id="target-resource"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={resourceName}
              onChange={(e) => setResourceName(e.target.value)}
            >
              {resources.map((r) => (
                <option key={r.name} value={r.name}>{r.title} ({r.name})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="external-id">Идентификатор записи в вашей системе</Label>
            <Input
              id="external-id"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="00-0001"
              className="font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground font-normal" htmlFor={rawMode ? "raw-json" : undefined}>
            {rawMode ? "JSON целиком" : `Поля ресурса «${resource.title}»`}
          </Label>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRawMode((v) => !v)}>
            {rawMode ? "Заполнить по полям" : "Вставить JSON"}
          </Button>
        </div>

        {rawMode ? (
          <Textarea
            id="raw-json"
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            rows={8}
            className="font-mono text-xs"
            spellCheck={false}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {resource.fields.write.map((field) => (
              <div key={field} className="space-y-1.5">
                <Label className="text-xs font-mono" htmlFor={`field-${field}`}>{field}</Label>
                <Input
                  id={`field-${field}`}
                  value={values[field] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}

        {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={send} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Отправить в систему
          </Button>
          <CopyButton
            text={curlSnippet("POST", `/${resource.name}/upsert`, body.replace(/\n\s*/g, ""))}
            label="Скопировать curl"
          />
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Что уйдёт в запрос</summary>
          <pre className="mt-2 rounded-lg bg-secondary/60 p-3 overflow-x-auto">{body}</pre>
        </details>

        <ResultPanel result={result} emptyHint="Заполните поля и нажмите «Отправить в систему»." />
      </CardContent>
    </Card>
  );
}
