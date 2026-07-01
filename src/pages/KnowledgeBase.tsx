import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useUserProfile, usePrimaryRole } from "@/hooks/useUserProfile";
import { BookOpen, Plus, Search, FolderTree, FileText, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Category = { id: string; title: string; parent_id?: string | null; order_index: number };
type Article = {
  id: string;
  category_id?: string | null;
  title: string;
  excerpt?: string;
  content_md?: string;
  status: "draft" | "published" | "archived";
  tags?: string[];
  published_at?: string | null;
  updated_at?: string;
};

export default function KnowledgeBase() {
  const { data: profile } = useUserProfile();
  const role = usePrimaryRole();
  const companyId = profile?.company_id ?? null;
  const canEdit = ["hrd", "company_admin", "superadmin"].includes(role);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedArt, setSelectedArt] = useState<string | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [artOpen, setArtOpen] = useState(false);

  const { data: cats = [] } = useQuery({
    queryKey: ["kb-cats", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await laravelDb.from("knowledge_categories" as any).select("*").order("order_index");
      if (error) throw error;
      return (data as any[] as Category[]) ?? [];
    },
  });

  const { data: articles = [] } = useQuery({
    queryKey: ["kb-articles", companyId, selectedCat, search],
    enabled: !!companyId,
    queryFn: async () => {
      let q = laravelDb.from("knowledge_articles" as any).select("*").order("updated_at", { ascending: false });
      if (selectedCat) q = q.eq("category_id", selectedCat);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data as any[] as Article[]) ?? [];
      const s = search.trim().toLowerCase();
      return s ? rows.filter((a) => a.title.toLowerCase().includes(s) || (a.excerpt ?? "").toLowerCase().includes(s)) : rows;
    },
  });

  const current = useMemo(() => articles.find((a) => a.id === selectedArt) ?? null, [articles, selectedArt]);

  const createCat = useMutation({
    mutationFn: async (title: string) => {
      const { error } = await laravelDb.from("knowledge_categories" as any).insert({
        company_id: companyId, title, order_index: cats.length,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb-cats"] }); setCatOpen(false); toast.success("Раздел создан"); },
  });

  const createArt = useMutation({
    mutationFn: async (v: Partial<Article>) => {
      const { data, error } = await laravelDb.from("knowledge_articles" as any).insert({
        company_id: companyId, status: "published", published_at: new Date().toISOString(),
        author_id: profile?.user_id, category_id: selectedCat, ...v,
      }).select().single();
      if (error) throw error;
      return data as unknown as Article;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["kb-articles"] });
      setSelectedArt(row.id); setArtOpen(false); toast.success("Статья опубликована");
    },
  });

  const removeArt = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("knowledge_articles" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb-articles"] }); setSelectedArt(null); },
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            База знаний
          </h1>
          <p className="text-sm text-muted-foreground">Внутренняя wiki компании — процессы, регламенты, гайды</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Dialog open={catOpen} onOpenChange={setCatOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><FolderTree className="w-4 h-4 mr-2" />Раздел</Button>
              </DialogTrigger>
              <CategoryDialog onSubmit={(t) => createCat.mutate(t)} />
            </Dialog>
            <Dialog open={artOpen} onOpenChange={setArtOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Статья</Button>
              </DialogTrigger>
              <ArticleDialog cats={cats} defaultCat={selectedCat} onSubmit={(v) => createArt.mutate(v)} />
            </Dialog>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Разделы</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <button
              onClick={() => setSelectedCat(null)}
              className={`w-full text-left px-3 py-2 rounded ${!selectedCat ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
            >Все статьи</button>
            {cats.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCat(c.id)}
                className={`w-full text-left px-3 py-2 rounded ${selectedCat === c.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
              >{c.title}</button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
            {articles.length === 0 && <p className="text-sm text-muted-foreground">Статей пока нет</p>}
            {articles.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedArt(a.id)}
                className={`w-full text-left p-3 rounded-lg border ${selectedArt === a.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium truncate">{a.title}</span>
                </div>
                {a.excerpt && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.excerpt}</p>}
                <div className="flex gap-1 mt-2">
                  <Badge variant="outline" className="text-[10px]">{a.status}</Badge>
                  {a.updated_at && (
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(a.updated_at).toLocaleDateString("ru-RU")}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{current ? current.title : "Выберите статью"}</CardTitle>
            {current && canEdit && (
              <Button variant="ghost" size="icon" onClick={() => removeArt.mutate(current.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {current ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{current.content_md ?? current.excerpt ?? ""}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Выберите статью слева, чтобы прочитать</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CategoryDialog({ onSubmit }: { onSubmit: (t: string) => void }) {
  const [title, setTitle] = useState("");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Новый раздел</DialogTitle></DialogHeader>
      <div><Label>Название</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <DialogFooter>
        <Button disabled={!title.trim()} onClick={() => onSubmit(title)}>Создать</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ArticleDialog({ cats, defaultCat, onSubmit }: { cats: Category[]; defaultCat: string | null; onSubmit: (v: Partial<Article>) => void }) {
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(defaultCat);
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Новая статья</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Заголовок</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div>
          <Label>Раздел</Label>
          <Select value={categoryId ?? "none"} onValueChange={(v) => setCategoryId(v === "none" ? null : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Без раздела</SelectItem>
              {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Краткое описание</Label><Textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} /></div>
        <div><Label>Содержание (Markdown)</Label><Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} className="font-mono text-sm" /></div>
      </div>
      <DialogFooter>
        <Button disabled={!title.trim()} onClick={() => onSubmit({ title, category_id: categoryId, excerpt, content_md: content })}>
          Опубликовать
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
