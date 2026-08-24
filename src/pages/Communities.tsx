import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useUserProfile, usePrimaryRole } from "@/hooks/useUserProfile";
import { Users, Plus, Lock, Globe, EyeOff, UserPlus, UserMinus, ImagePlus, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { laravelStorage } from "@/integrations/laravel/storage";
import { laravel } from "@/integrations/laravel/client";

type Community = {
  id: string;
  title: string;
  description?: string;
  privacy: "open" | "closed" | "secret";
  members_count: number;
  owner_id?: string | null;
  cover_url?: string | null;
  avatar_url?: string | null;
};

type Membership = { id: string; community_id: string; user_id: string; role: string };

const PRIVACY_ICON = { open: Globe, closed: Lock, secret: EyeOff } as const;
const PRIVACY_LABEL = { open: "Открытое", closed: "Закрытое", secret: "Скрытое" } as const;

export default function Communities() {
  const { data: profile } = useUserProfile();
  const role = usePrimaryRole();
  const companyId = profile?.company_id ?? null;
  const userId = profile?.user_id ?? null;
  const canCreate = ["hr", "hrd", "company_admin", "manager", "superadmin"].includes(role);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const uploadImage = async (communityId: string, kind: "cover" | "avatar", file?: File) => {
    if (!file || !companyId) return;
    setUploadingId(communityId);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `communities/${communityId}-${kind}.${ext}`;
    const { data, error } = await laravelStorage.from("content-media").upload(path, file, { upsert: true });
    if (error || !data?.url) {
      toast.error(error?.message || "Не удалось загрузить изображение");
      setUploadingId(null);
      return;
    }
    const field = kind === "cover" ? "cover_url" : "avatar_url";
    const { error: updateError } = await laravelDb.from("portal_communities" as any).update({ [field]: data.url }).eq("id", communityId);
    setUploadingId(null);
    if (updateError) toast.error(updateError.message);
    else {
      toast.success(kind === "cover" ? "Обложка обновлена" : "Юзерпик обновлён");
      qc.invalidateQueries({ queryKey: ["portal-communities"] });
    }
  };

  const { data: communities = [] } = useQuery({
    queryKey: ["portal-communities", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await laravelDb.from("portal_communities" as any).select("*").order("title");
      if (error) throw error;
      return (data as any[] as Community[]) ?? [];
    },
  });

  const { data: myMemberships = [] } = useQuery({
    queryKey: ["portal-my-memberships", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await laravelDb.from("portal_community_members" as any).select("*").eq("user_id", userId!);
      if (error) throw error;
      return (data as any[] as Membership[]) ?? [];
    },
  });

  const memberOf = new Map(myMemberships.map((m) => [m.community_id, m.id]));

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return communities;
    return communities.filter((c) =>
      `${c.title} ${c.description ?? ""}`.toLowerCase().includes(q),
    );
  }, [communities, search]);

  const createCommunity = useMutation({
    mutationFn: async (patch: Partial<Community>) => {
      const { data, error } = await laravelDb.from("portal_communities" as any).insert({
        company_id: companyId, owner_id: userId, privacy: "open", ...patch,
      }).select().single();
      if (error) throw error;
      // auto-join owner
      await laravelDb.from("portal_community_members" as any).insert({
        company_id: companyId, community_id: (data as any).id, user_id: userId, role: "owner",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-communities"] });
      qc.invalidateQueries({ queryKey: ["portal-my-memberships"] });
      setOpen(false);
      toast.success("Сообщество создано");
    },
  });

  const join = useMutation({
    mutationFn: async (communityId: string) => {
      const { error } = await laravel.post(`/portal/communities/${communityId}/join`);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-my-memberships"] });
      qc.invalidateQueries({ queryKey: ["portal-communities"] });
      toast.success("Вы вступили в сообщество");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось вступить в сообщество"),
  });

  const leave = useMutation({
    mutationFn: async (communityId: string) => {
      const { error } = await laravel.delete(`/portal/communities/${communityId}/membership`);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-my-memberships"] });
      qc.invalidateQueries({ queryKey: ["portal-communities"] });
      toast.success("Вы вышли из сообщества");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось выйти из сообщества"),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Сообщества
          </h1>
          <p className="text-sm text-muted-foreground">Клубы по интересам и профессиональные группы</p>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Создать</Button></DialogTrigger>
            <CreateCommunityDialog onSubmit={(v) => createCommunity.mutate(v)} />
          </Dialog>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Поиск сообщества по названию или описанию…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск сообщества"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">
            {communities.length === 0 ? "Сообществ пока нет" : "Ничего не найдено — измените запрос"}
          </p>
        )}
        {visible.map((c) => {
          const Icon = PRIVACY_ICON[c.privacy];
          const membershipId = memberOf.get(c.id);
          return (
            <Card key={c.id}>
              {c.cover_url ? (
                <img src={c.cover_url} alt={`Обложка сообщества ${c.title}`} className="h-32 w-full cursor-pointer object-cover rounded-t-lg" loading="lazy" onClick={() => navigate(`/communities/${c.id}`)} />
              ) : (
                <div className="h-32 bg-muted flex items-center justify-center rounded-t-lg cursor-pointer" onClick={() => navigate(`/communities/${c.id}`)}><Users className="h-10 w-10 text-muted-foreground" /></div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  {c.avatar_url ? <img src={c.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10"><Users className="h-4 w-4 text-primary" /></span>}
                  <CardTitle
                    className="text-base flex-1 truncate cursor-pointer transition-colors hover:text-primary"
                    onClick={() => navigate(`/communities/${c.id}`)}
                  >
                    {c.title}
                  </CardTitle>
                  <Badge variant="outline"><Icon className="w-3 h-3 mr-1" />{PRIVACY_LABEL[c.privacy]}</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {c.description && <p className="text-sm text-muted-foreground line-clamp-3">{c.description}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{c.members_count || 0} участн.</span>
                  {membershipId ? (
                    <Button size="sm" variant="outline" onClick={() => leave.mutate(c.id)}>
                      <UserMinus className="w-3 h-3 mr-1" />Выйти
                    </Button>
                  ) : (
                    <Button size="sm" disabled={c.privacy !== "open" || join.isPending} onClick={() => join.mutate(c.id)}>
                      <UserPlus className="w-3 h-3 mr-1" />{c.privacy === "open" ? "Вступить" : "По приглашению"}
                    </Button>
                  )}
                </div>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => navigate(`/communities/${c.id}`)}>
                  Открыть сообщество
                </button>


                {(c.owner_id === userId || canCreate) && (
                  <div className="flex flex-wrap gap-3">
                    {(["avatar", "cover"] as const).map((kind) => <label key={kind} className="inline-flex cursor-pointer items-center gap-2 text-xs text-primary hover:underline">
                      {uploadingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                      {kind === "avatar" ? "Юзерпик" : "Обложка"}
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={uploadingId === c.id} onChange={(event) => void uploadImage(c.id, kind, event.target.files?.[0])} />
                    </label>)}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function CreateCommunityDialog({ onSubmit }: { onSubmit: (v: Partial<Community>) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<Community["privacy"]>("open");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Новое сообщество</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Название</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label>Описание</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div>
          <Label>Приватность</Label>
          <Select value={privacy} onValueChange={(v) => setPrivacy(v as Community["privacy"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PRIVACY_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!title.trim()} onClick={() => onSubmit({ title, description, privacy })}>Создать</Button>
      </DialogFooter>
    </DialogContent>
  );
}
