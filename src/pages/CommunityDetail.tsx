import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { laravel } from "@/integrations/laravel/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { ArrowLeft, Users, Lock, Globe, EyeOff, UserPlus, UserMinus, Plus, Paperclip, FileText } from "lucide-react";
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

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Загрузка сообщества…</div>;
  if (!community) return <div className="p-6 text-sm text-muted-foreground">Сообщество не найдено</div>;

  const Icon = PRIVACY_ICON[(community.privacy as keyof typeof PRIVACY_ICON) ?? "open"];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/communities")}>
        <ArrowLeft className="mr-2 h-4 w-4" />К списку сообществ
      </Button>

      <Card className="overflow-hidden">
        {community.cover_url ? (
          <img src={community.cover_url} alt={`Обложка сообщества ${community.title}`} className="h-40 w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-40 items-center justify-center bg-muted"><Users className="h-12 w-12 text-muted-foreground" /></div>
        )}
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            {community.avatar_url
              ? <img src={community.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
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
                        <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                          <Paperclip className="h-3.5 w-3.5" />{a.name || "Файл"}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="members" className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {memberProfiles.map((m: any) => (
              <Card key={m.user_id}>
                <CardContent className="flex items-center gap-3 py-4">
                  {m.avatar_url
                    ? <img src={m.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                    : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm">{(m.full_name || "?").slice(0, 1)}</span>}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.full_name}</div>
                    <div className="truncate text-xs text-muted-foreground">{m.department || "—"}</div>
                  </div>
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
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{f.name || "Файл"}</a>
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
