/**
 * Модуль «Инициативы сотрудников» — предложения, голосование, модерация.
 * Является одним из сигналов KPI-блока в дашборде «Комфорт работы».
 */
import { useEffect, useState } from "react";
import { laravel } from "@/integrations/laravel/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, ThumbsUp, Plus, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";

const statusLabel: Record<string, string> = {
  new: "Новое", in_review: "На рассмотрении", accepted: "Принято", rejected: "Отклонено", done: "Реализовано",
};
const statusColor: Record<string, string> = {
  new: "bg-muted", in_review: "bg-amber-500/15 text-amber-500",
  accepted: "bg-emerald-500/15 text-emerald-500", rejected: "bg-red-500/15 text-red-500",
  done: "bg-primary/15 text-primary",
};

export default function Initiatives() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await laravel.get<any>("/initiatives");
    setItems(data?.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function submit() {
    if (!title.trim()) return;
    const { error } = await laravel.post<any>("/initiatives", { title, description });
    if (error) return toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    toast({ title: "Инициатива отправлена" });
    setTitle(""); setDescription(""); setOpen(false); load();
  }
  async function vote(id: string) {
    await laravel.post<any>(`/initiatives/${id}/vote`, {});
    load();
  }
  async function remove(id: string) {
    await laravel.delete<any>(`/initiatives/${id}`);
    load();
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-serif">Инициативы сотрудников</h1>
          <p className="text-sm text-muted-foreground">
            Предложите улучшение продукта или процесса. Голоса коллег помогают приоритизировать.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Предложить</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Новая инициатива</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Textarea placeholder="Опишите идею и ожидаемый эффект" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <DialogFooter><Button onClick={submit}>Отправить</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Пока нет инициатив.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <Card key={i.id}>
              <CardContent className="p-4 flex items-start gap-4">
                <button onClick={() => vote(i.id)} className={`flex flex-col items-center px-3 py-2 rounded-lg border transition ${i.voted ? "bg-primary/10 border-primary text-primary" : "hover:bg-muted"}`}>
                  <ThumbsUp className="h-4 w-4" />
                  <span className="text-sm font-medium mt-1">{i.votes_count}</span>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={statusColor[i.status]}>{statusLabel[i.status]}</Badge>
                    {i.category && <Badge variant="secondary">{i.category}</Badge>}
                  </div>
                  <h3 className="font-medium">{i.title}</h3>
                  {i.description && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{i.description}</p>}
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <Avatar className="h-5 w-5"><AvatarImage src={i.author_avatar ?? undefined} /><AvatarFallback>{(i.author_name ?? "?").slice(0, 1)}</AvatarFallback></Avatar>
                    <span>{i.author_name ?? "—"}</span>
                    <span>·</span>
                    <span>{new Date(i.created_at).toLocaleDateString("ru-RU")}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(i.id)}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
