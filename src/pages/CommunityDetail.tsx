import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { laravel } from "@/integrations/laravel/client";
import { chatApi } from "@/integrations/laravel/chat";
import { useUserProfile } from "@/hooks/useUserProfile";
import { ArrowLeft, Users, Lock, Globe, EyeOff, UserPlus, UserMinus, Plus, Paperclip, FileText, MessageSquare, Trash2, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichContent } from "@/components/ui/rich-content";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { toast } from "sonner";
import { resolveUrl } from "@/lib/utils";
import { fetchHrdDirectory } from "@/lib/hrdDirectory";

const PRIVACY_ICON = { open: Globe, closed: Lock, secret: EyeOff } as const;
const PRIVACY_LABEL = { open: "Открытое", closed: "Закрытое", secret: "Скрытое" } as const;

type Attachment = { name?: string; url?: string; kind?: string };

export default function CommunityDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useUserProfile();
  const companyId = profile?.company_id ?? null;
  const userId = profile?.user_id ?? null;
  const [composerOpen, setComposerOpen] = useState(false);

  const { data: community, isLoading } = useQuery({
    queryKey: ["portal-community", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await laravelDb.from("portal_communities" as any).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["portal-community-posts", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("portal_posts" as any)
        .select("*")
        .eq("community_id", id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["portal-community-members", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await laravelDb.from("portal_community_members" as any).select("*").eq("community_id", id).limit(500);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const memberIds = members.map((m: any) => String(m.user_id));
  const { data: memberProfiles = [] } = useQuery({
    queryKey: ["portal-community-member-profiles", id, memberIds.length],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("profiles" as any)
        .select("user_id,full_name,avatar_url,department")
        .in("user_id", memberIds)
        .limit(500);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: mentionPeople = [] } = useQuery({
    queryKey: ["portal-community-mention-people", companyId],
    enabled: !!companyId,
    queryFn: async () => fetchHrdDirectory(),
  });

  const files = useMemo(() => {
    const list: Attachment[] = [];
    for (const post of posts) {
      const attachments = Array.isArray(post.attachments) ? post.attachments : [];
      for (const a of attachments) if (a?.url) list.push(a as Attachment);
    }
    return list;
  }, [posts]);

  const isMember = memberIds.includes(String(userId));

  const join = useMutation({
    mutationFn: async () => {
      const { error } = await laravel.post(`/portal/communities/${id}/join`);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-community-members", id] });
      qc.invalidateQueries({ queryKey: ["portal-my-memberships"] });
      toast.success("Вы вступили в сообщество");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось вступить"),
  });

  const leave = useMutation({
    mutationFn: async () => {
      const { error } = await laravel.delete(`/portal/communities/${id}/membership`);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-community-members", id] });
      qc.invalidateQueries({ queryKey: ["portal-my-memberships"] });
      toast.success("Вы вышли из сообщества");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось выйти"),
  });

  const createPost = useMutation({
    mutationFn: async (patch: { title: string; body_md: string }) => {
      const { error } = await laravelDb.from("portal_posts" as any).insert({
        company_id: companyId,
        author_id: userId,
        community_id: id,
        kind: "post",
        published_at: new Date().toISOString(),
        ...patch,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-community-posts", id] });
      setComposerOpen(false);
      toast.success("Опубликовано в сообществе");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось опубликовать"),
  });

  const startDirectChat = async (targetUserId: string) => {
    const { data, error } = await chatApi.createDirect(String(targetUserId));
    if (error) {
      toast.error(error.message ?? "Не удалось открыть диалог");
      return;
    }
    const conversationId = (data as any)?.data?.id ?? (data as any)?.id;
    navigate(conversationId ? `/chats/${conversationId}` : "/chats");
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Загрузка сообщества…</div>;
  if (!community) return <div className="p-6 text-sm text-muted-foreground">Сообщество не найдено</div>;

  const Icon = PRIVACY_ICON[(community.privacy as keyof typeof PRIVACY_ICON) ?? "open"];
  const communityCoverUrl = resolveUrl(community.cover_url);
  const communityAvatarUrl = resolveUrl(community.avatar_url);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/communities")}>
        <ArrowLeft className="mr-2 h-4 w-4" />К списку сообществ
      </Button>

      <Card className="overflow-hidden">
        {communityCoverUrl ? (
          <img src={communityCoverUrl} alt={`Обложка сообщества ${community.title}`} className="h-40 w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-40 items-center justify-center bg-muted"><Users className="h-12 w-12 text-muted-foreground" /></div>
        )}
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            {communityAvatarUrl
              ? <img src={communityAvatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
              : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"><Users className="h-5 w-5 text-primary" /></span>}
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-xl">{community.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{memberIds.length} участников</p>
            </div>
            <Badge variant="outline"><Icon className="mr-1 h-3 w-3" />{PRIVACY_LABEL[(community.privacy as keyof typeof PRIVACY_LABEL) ?? "open"]}</Badge>
            {isMember ? (
              <Button size="sm" variant="outline" onClick={() => leave.mutate()}><UserMinus className="mr-1 h-3 w-3" />Выйти</Button>
            ) : (
              <Button size="sm" disabled={community.privacy !== "open" || join.isPending} onClick={() => join.mutate()}>
                <UserPlus className="mr-1 h-3 w-3" />{community.privacy === "open" ? "Вступить" : "По приглашению"}
              </Button>
            )}
          </div>
          {community.description && <p className="pt-2 text-sm text-muted-foreground">{community.description}</p>}
        </CardHeader>
      </Card>

      <Tabs defaultValue="feed">
        <TabsList>
          <TabsTrigger value="feed">Обсуждения ({posts.length})</TabsTrigger>
          <TabsTrigger value="members">Участники ({memberIds.length})</TabsTrigger>
          <TabsTrigger value="files">Файлы ({files.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="space-y-3 pt-4">
          {isMember && (
            <Button onClick={() => setComposerOpen(true)}><Plus className="mr-2 h-4 w-4" />Новая запись</Button>
          )}
          {posts.length === 0 && <p className="text-sm text-muted-foreground">В сообществе пока нет записей</p>}
          {posts.map((p: any) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("ru-RU")}</div>
                {p.title && <CardTitle className="text-base">{p.title}</CardTitle>}
              </CardHeader>
              <CardContent className="space-y-3">
                {p.body_md && <RichContent value={p.body_md} />}
                {Array.isArray(p.attachments) && p.attachments.length > 0 && (
                  <ul className="space-y-1">
                    {p.attachments.map((a: Attachment, i: number) => (
                      <li key={i}>
                        <a href={resolveUrl(a.url) ?? a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                          <Paperclip className="h-3.5 w-3.5" />{a.name || "Файл"}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <PostComments
                  postId={p.id}
                  companyId={companyId}
                  userId={userId}
                  canComment={isMember}
                  people={(mentionPeople.length ? mentionPeople : memberProfiles) as any[]}
                />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="members" className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {memberProfiles.map((m: any) => (
              <Card key={m.user_id}>
                <CardContent className="flex items-center gap-3 py-4">
                  <Link to={`/users/${m.user_id}`} className="flex-shrink-0">
                    {resolveUrl(m.avatar_url)
                      ? <img src={resolveUrl(m.avatar_url)} alt={m.full_name} className="h-10 w-10 rounded-full object-cover" />
                      : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm">{(m.full_name || "?").slice(0, 1)}</span>}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to={`/users/${m.user_id}`} className="block truncate text-sm font-medium hover:underline">{m.full_name}</Link>
                    <div className="truncate text-xs text-muted-foreground">{m.department || "—"}</div>
                  </div>
                  {String(m.user_id) !== String(userId) && (
                    <Button size="icon" variant="ghost" title="Написать в личку" onClick={() => startDirectChat(m.user_id)}>
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
            {memberProfiles.length === 0 && <p className="text-sm text-muted-foreground">Участников пока нет</p>}
          </div>
        </TabsContent>

        <TabsContent value="files" className="pt-4">
          {files.length === 0 && <p className="text-sm text-muted-foreground">Файлов пока нет</p>}
          <ul className="space-y-2">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded-md border p-3 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <a href={resolveUrl(f.url) ?? f.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{f.name || "Файл"}</a>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>

      <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
        <CommunityPostDialog onSubmit={(v) => createPost.mutate(v)} pending={createPost.isPending} />
      </Dialog>
    </div>
  );
}

function CommunityPostDialog({ onSubmit, pending }: { onSubmit: (v: { title: string; body_md: string }) => void; pending: boolean }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const hasBody = body.replace(/<[^>]*>/g, "").trim().length > 0 || /<(img|video)\b/i.test(body);
  return (
    <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 p-0">
      <DialogHeader className="border-b p-6 pb-4"><DialogTitle>Новая запись сообщества</DialogTitle></DialogHeader>
      <div className="flex-1 space-y-3 overflow-y-auto p-6">
        <div><Label>Заголовок</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label>Текст</Label><RichTextEditor value={body} onChange={setBody} maxHeight="45vh" /></div>
      </div>
      <DialogFooter className="border-t bg-background p-4">
        <Button disabled={!hasBody || pending} onClick={() => onSubmit({ title, body_md: body })}>Опубликовать</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PostComments({
  postId,
  companyId,
  userId,
  canComment,
  people,
}: {
  postId: string;
  companyId: string | null;
  userId: string | null;
  canComment: boolean;
  people: any[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  // Упоминания: «@» + начало ФИО/e-mail открывает список коллег.
  const mentionMatches = (() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.trim().toLowerCase();
    return (people ?? [])
      .filter((p) => !q || String(p.full_name ?? "").toLowerCase().includes(q) || String(p.email ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  })();

  const handleTextChange = (value: string) => {
    setText(value);
    const m = value.match(/(?:^|\s)@([^@\n]{0,30})$/);
    setMentionQuery(m ? m[1] : null);
  };

  const insertMention = (person: any) => {
    const next = text.replace(/(?:^|\s)@([^@\n]{0,30})$/, (full) => {
      const prefix = full.startsWith("@") ? "" : full[0];
      return `${prefix}@[${person.full_name}](${person.user_id}) `;
    });
    setText(next);
    setMentionQuery(null);
  };

  const { data: comments = [] } = useQuery({
    queryKey: ["portal-post-comments", postId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("portal_post_comments" as any)
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const authorIds = [...new Set(comments.map((c: any) => String(c.author_id)).filter(Boolean))];
  const { data: authors = [] } = useQuery({
    queryKey: ["portal-comment-authors", postId, authorIds.join(",")],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("profiles" as any)
        .select("user_id,full_name,avatar_url")
        .in("user_id", authorIds)
        .limit(200);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
  const authorMap = new Map(authors.map((a: any) => [String(a.user_id), a]));

  const addComment = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await laravelDb.from("portal_post_comments" as any).insert({
        company_id: companyId,
        post_id: postId,
        author_id: userId,
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["portal-post-comments", postId] });
      qc.invalidateQueries({ queryKey: ["portal-community-posts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось отправить комментарий"),
  });

  const removeComment = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await laravelDb.from("portal_post_comments" as any).delete().eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-post-comments", postId] }),
    onError: (e: any) => toast.error(e?.message ?? "Не удалось удалить комментарий"),
  });

  return (
    <div className="border-t pt-3">
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
        <MessageSquare className="mr-2 h-4 w-4" />
        {open ? "Скрыть комментарии" : "Комментарии"}
        {comments.length > 0 && <span className="ml-1 text-muted-foreground">({comments.length})</span>}
      </Button>

      {open && (
        <div className="space-y-3 pt-3">
          {comments.length === 0 && <p className="text-sm text-muted-foreground">Комментариев пока нет</p>}
          {comments.map((c: any) => {
            const author = authorMap.get(String(c.author_id));
            return (
              <div key={c.id} className="flex items-start gap-2">
                <Link to={`/users/${c.author_id}`} className="flex-shrink-0">
                  {resolveUrl(author?.avatar_url)
                    ? <img src={resolveUrl(author?.avatar_url)} alt={author.full_name} className="h-8 w-8 rounded-full object-cover" />
                    : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs">{(author?.full_name || "?").slice(0, 1)}</span>}
                </Link>
                <div className="min-w-0 flex-1 rounded-lg bg-muted/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Link to={`/users/${c.author_id}`} className="text-xs font-medium hover:underline">
                      {author?.full_name || "Сотрудник"}
                    </Link>
                    <span className="text-[11px] text-muted-foreground">{new Date(c.created_at).toLocaleString("ru-RU")}</span>
                  </div>
                  <CommentBody body={String(c.body ?? "")} />
                </div>
                {String(c.author_id) === String(userId) && (
                  <Button size="icon" variant="ghost" onClick={() => removeComment.mutate(c.id)} title="Удалить">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            );
          })}

          {canComment ? (
            <div className="relative flex items-end gap-2">
              {mentionQuery !== null && mentionMatches.length > 0 && (
                <div className="absolute bottom-full left-0 z-50 mb-1 w-72 rounded-md border bg-popover p-1 shadow-lg">
                  {mentionMatches.map((person: any) => (
                    <button
                      key={person.user_id}
                      type="button"
                      onClick={() => insertMention(person)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-secondary"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px]">
                        {(person.full_name || "?").slice(0, 1)}
                      </span>
                      <span className="truncate">{person.full_name}</span>
                    </button>
                  ))}
                </div>
              )}
              <Textarea
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Написать комментарий… (@ — упомянуть коллегу)"
                rows={2}
                className="min-h-0 flex-1"
              />
              <Button
                size="icon"
                disabled={!text.trim() || addComment.isPending}
                onClick={() => addComment.mutate(text.trim())}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Вступите в сообщество, чтобы комментировать</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Рендер текста комментария: @[Имя](user_id) превращается в ссылку на профиль. */
function CommentBody({ body }: { body: string }) {
  const parts: (string | { name: string; id: string })[] = [];
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push({ name: m[1], id: m[2] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));

  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <Link key={i} to={`/users/${part.id}`} className="text-primary hover:underline">
            @{part.name}
          </Link>
        ),
      )}
    </p>
  );
}
