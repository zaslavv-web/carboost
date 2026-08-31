/**
 * Консоль выдачи данных (поддомен api-out).
 *
 * Перечень методов не захардкожен: он приходит из /meta/resources, который
 * собирается из того же реестра, что и маршруты API. Поэтому новый ресурс
 * появляется на странице сам, без правок этого файла.
 */
import { useCallback, useEffect, useState } from "react";
import { Database, Download, Loader2, Radio, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ConsoleHeader, ConsoleLayout, CopyButton, KeyField, ResultPanel,
} from "@/components/integration/ConsoleShell";
import {
  ApiResult, MetaResponse, ResourceMeta, callApi, curlSnippet, loadKey, saveKey,
} from "@/lib/integrationConsole";

export default function OutboundConsole() {
  const [key, setKey] = useState(loadKey);
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

  // Ключ мог остаться в этой вкладке — тогда подключаемся сразу.
  useEffect(() => {
    if (loadKey()) void connect();
    // Намеренно один раз при монтировании: дальше подключение по кнопке.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readable = (meta?.resources ?? []).filter((r) => r.operations.includes("list"));

  return (
    <div className="min-h-screen bg-background">
      <ConsoleHeader
        title="Выдача данных"
        subtitle="Все методы платформы, отдающие данные наружу. Укажите ключ — и заберите
                  выборку прямо здесь, чтобы увидеть формат до того, как писать интеграцию."
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
                <CardTitle className="text-base">Что доступно ключу</CardTitle>
                <CardDescription>
                  Права определяются скоупами ключа. Ресурсы без права чтения показаны, но
                  запросить их нельзя — так видно, чего не хватает.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {meta.resources.map((r) => (
                  <Badge key={r.name} variant={r.granted.read ? "outline" : "secondary"}>
                    {r.name}
                    {!r.granted.read && " · нет доступа"}
                  </Badge>
                ))}
              </CardContent>
            </Card>

            <EventsCard apiKey={key} />

            <div className="space-y-4">
              <h2 className="text-lg font-medium flex items-center gap-2">
                <Database className="h-4 w-4" />
                Методы выдачи данных
                <span className="text-sm font-normal text-muted-foreground">({readable.length})</span>
              </h2>
              {readable.map((resource) => (
                <ResourceCard key={resource.name} resource={resource} apiKey={key} />
              ))}
            </div>
          </>
        )}
      </ConsoleLayout>
    </div>
  );
}

function ResourceCard({ resource, apiKey }: { resource: ResourceMeta; apiKey: string }) {
  const [limit, setLimit] = useState("10");
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [updatedSince, setUpdatedSince] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult<unknown> | null>(null);

  const query = () => {
    const params = new URLSearchParams({ limit: limit || "10" });
    if (filterField && filterValue) params.set(filterField, filterValue);
    if (updatedSince) params.set("updated_since", updatedSince);
    return `/${resource.name}?${params.toString()}`;
  };

  const fetchData = async () => {
    setLoading(true);
    setResult(await callApi(query(), apiKey));
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-base">{resource.title}</CardTitle>
            <CardDescription className="mt-1">
              <code className="text-xs">GET /api/integration/v1/{resource.name}</code>
            </CardDescription>
          </div>
          <Badge variant={resource.granted.read ? "outline" : "secondary"}>
            {resource.scope_read}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Поля в ответе</p>
          <div className="flex flex-wrap gap-1">
            {resource.fields.read.map((f) => (
              <code key={f} className="text-[11px] bg-secondary px-1.5 py-0.5 rounded">{f}</code>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`${resource.name}-limit`}>Сколько записей</Label>
            <Input id={`${resource.name}-limit`} type="number" min={1} max={200}
                   value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`${resource.name}-filter`}>Фильтр по полю</Label>
            <select
              id={`${resource.name}-filter`}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filterField}
              onChange={(e) => setFilterField(e.target.value)}
            >
              <option value="">— без фильтра —</option>
              {resource.filters.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`${resource.name}-value`}>Значение</Label>
            <Input
              id={`${resource.name}-value`}
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              disabled={!filterField}
              placeholder={filterField ? "через запятую — список" : "выберите поле"}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`${resource.name}-since`}>Изменено с</Label>
            <Input id={`${resource.name}-since`} type="date"
                   value={updatedSince} onChange={(e) => setUpdatedSince(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={fetchData} disabled={loading || !resource.granted.read}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Получить данные
          </Button>
          <CopyButton text={curlSnippet("GET", query())} label="Скопировать curl" />
          {!resource.granted.read && (
            <span className="text-xs text-muted-foreground">
              ключу не выдан скоуп {resource.scope_read}
            </span>
          )}
        </div>

        <ResultPanel result={result} emptyHint="Нажмите «Получить данные», чтобы увидеть ответ." />
      </CardContent>
    </Card>
  );
}

/**
 * Фид событий стоит отдельно: он отдаёт не записи ресурса, а поток изменений
 * по всей платформе, и читается по курсору, а не по фильтрам.
 */
function EventsCard({ apiKey }: { apiKey: string }) {
  const [since, setSince] = useState("0");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult<unknown> | null>(null);

  const path = `/events?since=${encodeURIComponent(since || "0")}&limit=20`;

  const fetchEvents = async () => {
    setLoading(true);
    const res = await callApi<{ page?: { next_cursor?: number } }>(path, apiKey);
    setResult(res);
    // Курсор двигаем сами: следующий запрос должен продолжить с этого места.
    if (res.ok && res.data?.page?.next_cursor !== undefined) {
      setSince(String(res.data.page.next_cursor));
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="h-4 w-4" />
          Поток событий
        </CardTitle>
        <CardDescription>
          Изменения по всем разделам продукта. Курсор возрастает, поэтому после паузы
          система догоняет пропущенное без дублей. <code className="text-xs">events:read</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="events-cursor">Курсор (since)</Label>
            <Input id="events-cursor" value={since} onChange={(e) => setSince(e.target.value)}
                   className="w-40 font-mono" />
          </div>
          <Button onClick={fetchEvents} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Получить события
          </Button>
          <CopyButton text={curlSnippet("GET", path)} label="Скопировать curl" />
        </div>
        <ResultPanel result={result} emptyHint="Курсор 0 — с самого начала журнала." />
      </CardContent>
    </Card>
  );
}
