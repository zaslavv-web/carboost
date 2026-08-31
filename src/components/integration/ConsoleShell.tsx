/**
 * Общая обвязка интеграционных консолей: шапка, ввод ключа, показ ответа.
 *
 * Обе страницы публичные — их открывает интегратор, у которого нет учётки в
 * продукте. Единственный ключ доступа к данным здесь API-ключ, поэтому без
 * него страница не показывает ничего, кроме формы ввода.
 */
import { ReactNode, useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { ApiResult } from "@/lib/integrationConsole";
import { formatBytes } from "@/lib/integrationConsole";

export function ConsoleHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl md:text-3xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-3xl">{subtitle}</p>
      </div>
    </header>
  );
}

export function KeyField({
  value,
  onChange,
  onConnect,
  connecting,
  connected,
}: {
  value: string;
  onChange: (v: string) => void;
  onConnect: () => void;
  connecting: boolean;
  connected: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Ключ доступа
        </CardTitle>
        <CardDescription>
          Ключ создаётся в продукте: раздел «Интеграции» → «Ключи API». Он остаётся в этой
          вкладке и уходит только в заголовок <code>Authorization</code> — никуда больше.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="api-key">API-ключ</Label>
          <div className="flex gap-2">
            <Input
              id="api-key"
              type={visible ? "text" : "password"}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onConnect()}
              placeholder="gp_xxxxxxxxxxxx_..."
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? "Скрыть ключ" : "Показать ключ"}
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button type="button" onClick={onConnect} disabled={connecting || !value.trim()}>
              {connecting && <Loader2 className="h-4 w-4 animate-spin" />}
              {connected ? "Обновить" : "Подключиться"}
            </Button>
          </div>
        </div>
        {connected && (
          <Badge variant="outline" className="gap-1">
            <Check className="h-3 w-3" /> Ключ принят
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

/** Кнопка копирования, которая коротко подтверждает действие. */
export function CopyButton({ text, label = "Скопировать" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } catch {
          /* буфер недоступен — пользователь скопирует выделением */
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {done ? "Скопировано" : label}
    </Button>
  );
}

/**
 * Единый показ результата вызова.
 *
 * Код ответа и время видны всегда, включая отказ: интегратору важно отличить
 * «нет прав» от «нет связи», а не увидеть одно слово «ошибка».
 */
export function ResultPanel({ result, emptyHint }: { result: ApiResult<unknown> | null; emptyHint: string }) {
  const [raw, setRaw] = useState(false);

  if (!result) {
    return <p className="text-sm text-muted-foreground">{emptyHint}</p>;
  }

  const rows = extractRows(result.data);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <Badge variant={result.ok ? "outline" : "destructive"}>
          HTTP {result.status || "—"}
        </Badge>
        <span className="text-muted-foreground">{result.durationMs} мс</span>
        {result.ok && <span className="text-muted-foreground">· {formatBytes(result.data)}</span>}
        {rows && <span className="text-muted-foreground">· записей: {rows.length}</span>}
        <div className="ml-auto flex gap-2">
          {rows && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setRaw((v) => !v)}>
              {raw ? "Таблицей" : "Сырой JSON"}
            </Button>
          )}
          <CopyButton text={JSON.stringify(result.data ?? result.error, null, 2)} label="Копировать ответ" />
        </div>
      </div>

      {!result.ok && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {result.error}
        </div>
      )}

      {result.ok && rows && !raw && <RowsTable rows={rows} />}

      {result.ok && (!rows || raw) && (
        <pre className="rounded-lg bg-secondary/60 p-3 text-xs overflow-x-auto max-h-96">
          {JSON.stringify(result.data, null, 2)}
        </pre>
      )}
    </div>
  );
}

/** Ответы списков всегда лежат в data — таблицу строим только для них. */
function extractRows(data: unknown): Record<string, unknown>[] | null {
  if (!data || typeof data !== "object") return null;
  const list = (data as { data?: unknown }).data;
  if (!Array.isArray(list)) return null;
  return list.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
}

function RowsTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Записей нет — выборка пуста.</p>;
  }

  // Колонки берём из первой записи: набор полей задан реестром и одинаков.
  const columns = Object.keys(rows[0]).slice(0, 8);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-secondary/60">
          <tr>
            {columns.map((c) => (
              <th key={c} className="text-left font-medium px-3 py-2 whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {columns.map((c) => (
                <td key={c} className="px-3 py-2 align-top max-w-[22rem] truncate" title={cell(row[c])}>
                  {cell(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

export function ConsoleLayout({ children }: { children: ReactNode }) {
  return <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">{children}</div>;
}
