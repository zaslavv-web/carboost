import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useUserProfile, usePrimaryRole } from "@/hooks/useUserProfile";
import { Users, Plus, Lock, Globe, EyeOff, UserPlus, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Community = {
  id: string;
  title: string;
  description?: string;
  privacy: "open" | "closed" | "secret";
  members_count: number;
  owner_id?: string | null;
};

type Membership = { id: string; community_id: string; user_id: string; role: string };

const PRIVACY_ICON = { open: Globe, closed: Lock, secret: EyeOff } as const;
const PRIVACY_LABEL = { open: "Открытое", closed: "Закрытое", secret: "Скрытое" } as const;

export default function Communities() {
  const { data: profile } = useUserProfile();
  const role = usePrimaryRole();
  const companyId = profile?.company_id ?? null;
  const userId = profile?.user_id ?? null;
  const canCreate = ["hrd", "company_admin", "manager", "superadmin"].includes(role);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

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
      const { error } = await laravelDb.from("portal_community_members" as any).insert({
        company_id: companyId, community_id: communityId, user_id: userId, role: "member",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-my-memberships"] });
      qc.invalidateQueries({ queryKey: ["portal-communities"] });
      toast.success("Вы вступили в сообщество");
    },
  });

  const leave = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await laravelDb.from("portal_community_members" as any).delete().eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-my-memberships"] }),
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {communities.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">Сообществ пока нет</p>
        )}
        {communities.map((c) => {
          const Icon = PRIVACY_ICON[c.privacy];
          const membershipId = memberOf.get(c.id);
          return (
            <Card key={c.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base flex-1 truncate">{c.title}</CardTitle>
                  <Badge variant="outline"><Icon className="w-3 h-3 mr-1" />{PRIVACY_LABEL[c.privacy]}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {c.description && <p className="text-sm text-muted-foreground line-clamp-3">{c.description}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{c.members_count || 0} участн.</span>
                  {membershipId ? (
                    <Button size="sm" variant="outline" onClick={() => leave.mutate(membershipId)}>
                      <UserMinus className="w-3 h-3 mr-1" />Выйти
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => join.mutate(c.id)}>
                      <UserPlus className="w-3 h-3 mr-1" />Вступить
                    </Button>
                  )}
                </div>
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
