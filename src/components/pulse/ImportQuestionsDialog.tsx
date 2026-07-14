import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, FileText, Download, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useBulkQuestions } from "@/hooks/usePulseTargeting";

interface Props {
  surveyId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type ParsedQuestion = {
  title: string;
  kind: string;
  options: string[] | null;
  is_required: boolean;
  error?: string;
};

const VALID_KINDS = ["scale", "nps", "single", "multi", "text"];

function parseCsv(text: string): ParsedQuestion[] {
  // Простая парсилка: разделитель — запятая или ; (авто-детект),
  // поля в кавычках "..." допускают запятую внутри.
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const sep = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";

  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === sep) { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }

  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name);
  const iTitle = idx("title");
  const iKind = idx("kind");
  const iOpts = idx("options");
  const iReq = idx("is_required");
  if (iTitle < 0 || iKind < 0) {
    return [{ title: "", kind: "", options: null, is_required: true, error: "Не найдены обязательные колонки title, kind" }];
  }

  const out: ParsedQuestion[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((x) => !x || !x.trim())) continue;
    const title = (row[iTitle] ?? "").trim();
    const kind = (row[iKind] ?? "").trim().toLowerCase();
    const optsRaw = iOpts >= 0 ? (row[iOpts] ?? "").trim() : "";
    const reqRaw = iReq >= 0 ? (row[iReq] ?? "").trim() : "1";
    let error: string | undefined;
    if (!title) error = "Пустой title";
    else if (!VALID_KINDS.includes(kind)) error = `Неизвестный kind: «${kind}»`;
    const options = (kind === "single" || kind === "multi")
      ? optsRaw.split(";").map((s) => s.trim()).filter(Boolean)
      : null;
    if ((kind === "single" || kind === "multi") && (!options || options.length < 2)) {
      error = error ?? "Для single/multi нужно минимум 2 варианта (через `;`)";
    }
    out.push({ title, kind, options, is_required: !["0", "false", "нет", "no"].includes(reqRaw.toLowerCase()), error });
  }
  return out;
}

const TEMPLATE = `title,kind,options,is_required
Насколько вы вовлечены в работу?,scale,,1
Порекомендуете ли вы компанию друзьям?,nps,,1
Какой формат работы предпочитаете?,single,Офис;Гибрид;Удалёнка,1
Что вам мешает работать эффективнее?,multi,Много встреч;Нехватка ресурсов;Смена приоритетов,0
Опишите одно, что улучшили бы прямо сейчас,text,,0
`;

export function ImportQuestionsDialog({ surveyId, open, onOpenChange }: Props) {
  const [rows, setRows] = useState<ParsedQuestion[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const bulk = useBulkQuestions(surveyId);

  const validRows = useMemo(() => (rows ?? []).filter((r) => !r.error), [rows]);
  const errorRows = useMemo(() => (rows ?? []).filter((r) => !!r.error), [rows]);

  const onFile = async (f: File) => {
    setFileName(f.name);
    const text = await f.text();
    setRows(parseCsv(text));
  };

  const downloadTemplate = () => {
    const blob = new Blob(["\ufeff" + TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "pulse-questions-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async () => {
    if (!validRows.length) return;
    try {
      const res = await bulk.mutateAsync(validRows.map((r) => ({
        title: r.title,
        kind: r.kind,
        options: r.options,
        is_required: r.is_required,
      })));
      toast.success(`Импортировано вопросов: ${res.imported}`);
      onOpenChange(false);
      setRows(null); setFileName("");
    } catch (e: any) {
      toast.error(e?.message ?? "Ошибка импорта");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Импорт вопросов из CSV</DialogTitle>
          <DialogDescription>
            Формат: <code>title, kind, options, is_required</code>. Варианты ответа для single/multi — через <code>;</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />Выбрать CSV
            </Button>
            <Button type="button" variant="ghost" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" />Скачать шаблон
            </Button>
            {fileName && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <FileText className="w-3 h-3" />{fileName}
              </span>
            )}
          </div>

          {rows && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Готовы к импорту: <strong>{validRows.length}</strong>, с ошибками: <strong>{errorRows.length}</strong>
              </div>

              {errorRows.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Ошибки в файле</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-5 space-y-1">
                      {errorRows.slice(0, 10).map((r, i) => (
                        <li key={i}><span className="text-xs">«{r.title || "—"}»:</span> {r.error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {validRows.length > 0 && (
                <div className="max-h-60 overflow-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">#</th>
                        <th className="text-left p-2">Вопрос</th>
                        <th className="text-left p-2">Тип</th>
                        <th className="text-left p-2">Варианты</th>
                        <th className="text-left p-2">Обяз.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, 20).map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{i + 1}</td>
                          <td className="p-2">{r.title}</td>
                          <td className="p-2">{r.kind}</td>
                          <td className="p-2">{r.options?.join(", ") ?? "—"}</td>
                          <td className="p-2">{r.is_required ? "да" : "нет"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button disabled={!validRows.length || bulk.isPending} onClick={doImport}>
            {bulk.isPending ? "Импорт…" : `Импортировать (${validRows.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
