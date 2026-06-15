import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookText, Upload, Search, Trash2, Loader2, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { laravel } from "@/integrations/laravel/client";

interface DocRow {
  source_id: string;
  title: string | null;
  source_type: string;
  embedding_model: string | null;
  embedding_dims: number | null;
  chunks: number;
  updated_at: string;
}

interface Hit {
  id: number;
  score: number;
  chunk_text: string;
  title: string | null;
  source_id: string;
}

const readAsText = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsText(f);
  });

export default function RagDocuments() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  const list = useQuery({
    queryKey: ["rag-docs"],
    queryFn: async () => {
      const r = await laravel.get<{ pgvector: boolean; documents: DocRow[] }>("/rag/documents");
      if (r.error) throw new Error(r.error.message);
      return r.data!;
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      let payload = text;
      let useTitle = title;
      if (file) {
        const fileText = await readAsText(file);
        payload = (payload ? payload + "\n" : "") + fileText;
        if (!useTitle) useTitle = file.name;
      }
      const r = await laravel.post<{ indexed: number; source_id: string }>("/rag/documents", {
        text: payload,
        title: useTitle || null,
        source_type: file ? "file" : "manual",
      });
      if (r.error) throw new Error(r.error.message);
      return r.data!;
    },
    onSuccess: (r) => {
      toast.success(`Документ проиндексирован: ${r.indexed} фрагментов`);
      setText(""); setTitle(""); setFile(null);
      qc.invalidateQueries({ queryKey: ["rag-docs"] });
    },
    onError: (e: any) => toast.error(e?.message || "Не удалось проиндексировать"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const r = await laravel.delete(`/rag/documents/${id}`);
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: () => {
      toast.success("Удалено");
      qc.invalidateQueries({ queryKey: ["rag-docs"] });
    },
  });

  const search = useMutation({
    mutationFn: async () => {
      const r = await laravel.post<{ hits: Hit[] }>("/rag/search", { query, k: 5 });
      if (r.error) throw new Error(r.error.message);
      return r.data!;
    },
    onSuccess: (r) => setHits(r.hits || []),
    onError: (e: any) => toast.error(e?.message || "Поиск не удался"),
  });

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <BookText className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">База знаний (RAG)</h1>
          <p className="text-sm text-muted-foreground">
            Локальный семантический поиск по документам компании. Используется AI-функциями
            для ответов на основе внутренних данных.
          </p>
        </div>
      </div>

      {list.data && (
        <Alert>
          <Database className="h-4 w-4" />
          <AlertTitle>Векторное хранилище</AlertTitle>
          <AlertDescription>
            {list.data.pgvector
              ? "pgvector активен — поиск на уровне БД (быстро)."
              : "pgvector недоступен — fallback на cosine в приложении. Для масштаба установите расширение pgvector."}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Загрузить документ</CardTitle>
          <CardDescription>
            Вставьте текст политики, регламента, FAQ — или загрузите .txt/.md файл.
            Документ будет разбит на фрагменты и проиндексирован embeddings активного AI-провайдера.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Заголовок</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Регламент отпусков 2026" />
          </div>
          <div>
            <Label>Файл (опционально, .txt/.md/.csv/.json)</Label>
            <Input type="file" accept=".txt,.md,.csv,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <Label>Текст</Label>
            <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Вставьте текст документа..." />
          </div>
          <Button onClick={() => upload.mutate()} disabled={upload.isPending || (!text && !file)}>
            {upload.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Проиндексировать
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Проверить поиск</CardTitle>
          <CardDescription>Убедитесь, что AI находит релевантные фрагменты по вашему запросу.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Например: сколько дней отпуска положено..." />
            <Button onClick={() => search.mutate()} disabled={search.isPending || !query.trim()}>
              {search.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Найти"}
            </Button>
          </div>
          {hits.length > 0 && (
            <div className="space-y-2">
              {hits.map((h, i) => (
                <div key={h.id} className="border rounded-md p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{i + 1}. {h.title || h.source_id}</span>
                    <Badge variant="outline">score {h.score.toFixed(3)}</Badge>
                  </div>
                  <p className="text-muted-foreground whitespace-pre-wrap">{h.chunk_text}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Проиндексированные документы</CardTitle>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
            </div>
          ) : (list.data?.documents?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Пока ничего не загружено.</p>
          ) : (
            <div className="space-y-2">
              {list.data!.documents.map((d) => (
                <div key={d.source_id} className="flex items-center justify-between border rounded-md p-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{d.title || d.source_id}</div>
                    <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                      <Badge variant="secondary">{d.source_type}</Badge>
                      <span>{d.chunks} фрагментов</span>
                      {d.embedding_model && <span>· {d.embedding_model}</span>}
                      {d.embedding_dims && <span>· {d.embedding_dims}d</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => del.mutate(d.source_id)} disabled={del.isPending}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />
      <p className="text-xs text-muted-foreground">
        После индексирования AI-сервисы могут вызывать <code>RagService::buildContext()</code>
        и подмешивать релевантные фрагменты в system-message — модель отвечает только на основе
        ваших документов.
      </p>
    </div>
  );
}
