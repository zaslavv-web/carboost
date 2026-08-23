import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useUserProfile, usePrimaryRole } from "@/hooks/useUserProfile";
import { Newspaper, Plus, Pin, MessageCircle, Heart, Trash2, Megaphone } from "lucide-react";
import { RichContent } from "@/components/ui/rich-content";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Post = {
  id: string;
  author_id: string;
  kind: "post" | "announcement" | "event" | "poll";
  title?: string;
  body_md?: string;
  is_pinned: boolean;
  published_at?: string | null;
  reactions_count: number;
  comments_count: number;
  created_at: string;
};

type Comment = { id: string; post_id: string; author_id: string; body: string; created_at: string };

const KIND_LABEL: Record<Post["kind"], string> = {
  post: "Пост",
  announcement: "Анонс",
  event: "Событие",
  poll: "Опрос",
};

export default function CorporateFeed() {
  const { data: profile } = useUserProfile();
  const role = usePrimaryRole();
  const companyId = profile?.company_id ?? null;
  const userId = profile?.user_id ?? null;
  const canPost = ["hr", "hrd", "company_admin", "manager", "superadmin"].includes(role);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Post | null>(null);

  const { data: posts = [] } = useQuery({
    queryKey: ["portal-posts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("portal_posts" as any)
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as any[] as Post[]) ?? [];
    },
  });

  const createPost = useMutation({
    mutationFn: async (patch: Partial<Post>) => {
      const { error } = await laravelDb.from("portal_posts" as any).insert({
        company_id: companyId,
        author_id: userId,
        published_at: new Date().toISOString(),
        ...patch,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-posts"] });
      setOpen(false);
      toast.success("Опубликовано");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось опубликовать"),
  });

  const removePost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("portal_posts" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-posts"] }),
  });

  // Мои реакции — чтобы «лайк» работал как переключатель, а не падал с 422
  // на уникальном индексе (post_id, user_id) при повторном клике.
  const { data: myReactions = [] } = useQuery({
    queryKey: ["portal-my-reactions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("portal_post_reactions" as any)
        .select("*")
        .eq("user_id", userId!)
        .limit(500);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
  const reactionByPost = new Map<string, string>(
    myReactions.map((r: any) => [String(r.post_id), String(r.id)]),
  );

  const react = useMutation({
    mutationFn: async (postId: string) => {
      const existing = reactionByPost.get(postId);
      if (existing) {
        const { error } = await laravelDb.from("portal_post_reactions" as any).delete().eq("id", existing);
        if (error) throw error;
        return;
      }
      const { error } = await laravelDb.from("portal_post_reactions" as any).insert({
        company_id: companyId,
        post_id: postId,
        user_id: userId,
        emoji: "👍",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-posts"] });
      qc.invalidateQueries({ queryKey: ["portal-my-reactions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось поставить реакцию"),
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Newspaper className="w-6 h-6 text-primary" />
            Корпоративная лента
          </h1>
          <p className="text-sm text-muted-foreground">Новости, анонсы и события компании</p>
        </div>
        {canPost && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Опубликовать</Button>
            </DialogTrigger>
            <CreatePostDialog onSubmit={(v) => createPost.mutate(v)} />
          </Dialog>
        )}
      </div>

      <div className="space-y-3">
        {posts.length === 0 && (
          <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">В ленте пока пусто</CardContent></Card>
        )}
        {posts.map((p) => (
          <Card key={p.id} className={p.is_pinned ? "border-primary/50" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {p.is_pinned && <Pin className="w-3 h-3 text-primary" />}
                <Badge variant={p.kind === "announcement" ? "default" : "outline"} className="text-xs">
                  {p.kind === "announcement" && <Megaphone className="w-3 h-3 mr-1" />}
                  {KIND_LABEL[p.kind]}
                </Badge>
                <span>{new Date(p.created_at).toLocaleString("ru-RU")}</span>
                {(role === "hr" || role === "hrd" || role === "superadmin" || p.author_id === userId) && (
                  <Button size="icon" variant="ghost" className="ml-auto h-6 w-6" onClick={() => removePost.mutate(p.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
              {p.title && (
                <CardTitle
                  className="text-lg mt-2 cursor-pointer hover:text-primary transition-colors"
                  onClick={() => setDetail(p)}
                >
                  {p.title}
                </CardTitle>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {p.body_md && (
                <div className="cursor-pointer" onClick={() => setDetail(p)}>
                  <RichContent value={p.body_md} className="line-clamp-6" />
                </div>
              )}
              <div className="flex items-center gap-3 pt-2 border-t">
                <Button
                  size="sm"
                  variant="ghost"
                  className={reactionByPost.has(p.id) ? "text-primary" : undefined}
                  onClick={() => react.mutate(p.id)}
                >
                  <Heart className={`w-4 h-4 mr-1 ${reactionByPost.has(p.id) ? "fill-current" : ""}`} />
                  {p.reactions_count || 0}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                  <MessageCircle className="w-4 h-4 mr-1" />{p.comments_count || 0}
                </Button>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setDetail(p)}>
                  Открыть
                </Button>
              </div>
              {expanded === p.id && <Comments postId={p.id} companyId={companyId} userId={userId} />}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.title || KIND_LABEL[detail?.kind ?? "post"]}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                {KIND_LABEL[detail.kind]} · {new Date(detail.created_at).toLocaleString("ru-RU")}
              </div>
              {detail.body_md && <RichContent value={detail.body_md} />}
              <Comments postId={detail.id} companyId={companyId} userId={userId} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Comments({ postId, companyId, userId }: { postId: string; companyId: string | null; userId: string | null }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const { data: comments = [] } = useQuery({
    queryKey: ["portal-comments", postId],
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("portal_post_comments" as any)
        .select("*")
        .eq("post_id", postId)
        .order("created_at");
      if (error) throw error;
      return (data as any[] as Comment[]) ?? [];
    },
  });
  const add = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await laravelDb.from("portal_post_comments" as any).insert({
        company_id: companyId, post_id: postId, author_id: userId, body,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["portal-comments", postId] }); setText(""); },
  });
  return (
    <div className="space-y-2 pt-2 border-t">
      {comments.map((c) => (
        <div key={c.id} className="text-sm p-2 bg-muted rounded">
          <div className="text-xs text-muted-foreground mb-1">{new Date(c.created_at).toLocaleString("ru-RU")}</div>
          {c.body}
        </div>
      ))}
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Написать комментарий..." />
        <Button size="sm" disabled={!text.trim()} onClick={() => add.mutate(text.trim())}>Отправить</Button>
      </div>
    </div>
  );
}

function CreatePostDialog({ onSubmit }: { onSubmit: (v: Partial<Post>) => void }) {
  const [kind, setKind] = useState<Post["kind"]>("post");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pin, setPin] = useState(false);
  const hasBody = body.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0 || /<(img|video)\b/i.test(body);
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Новая публикация</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Тип</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as Post["kind"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(KIND_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Заголовок</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label>Текст публикации</Label><RichTextEditor value={body} onChange={setBody} minHeight="260px" /></div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} />
          Закрепить в ленте
        </label>
      </div>
      <DialogFooter>
        <Button disabled={!hasBody} onClick={() => onSubmit({ kind, title, body_md: body, is_pinned: pin })}>
          Опубликовать
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
