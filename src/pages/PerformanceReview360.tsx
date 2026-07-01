import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Users, Plus, CheckCircle2, Clock, XCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";

type Review = {
  id: string;
  user_id: string;
  cycle_id: string;
  status: string;
};

type Reviewer = {
  id: string;
  review_id: string;
  reviewer_id: string;
  role: "self" | "manager" | "peer" | "subordinate" | "hr";
  status: "invited" | "submitted" | "declined";
  invited_at?: string | null;
  submitted_at?: string | null;
};

type Profile = { user_id: string; full_name?: string | null; position?: string | null };

const ROLE_LABEL = { self: "Self", manager: "Руководитель", peer: "Коллега", subordinate: "Подчинённый", hr: "HR" } as const;
const STATUS_ICON = { invited: Clock, submitted: CheckCircle2, declined: XCircle } as const;
const STATUS_COLOR = { invited: "text-muted-foreground", submitted: "text-emerald-600", declined: "text-rose-600" } as const;

export default function PerformanceReview360() {
  const { data: profile } = useUserProfile();
  const companyId = profile?.company_id ?? null;
  const qc = useQueryClient();
  const [selectedReview, setSelectedReview] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: reviews = [] } = useQuery({
    queryKey: ["360-reviews", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("performance_reviews" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[] as Review[]) ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["360-profiles"],
    queryFn: async () => {
      const { data, error } = await laravelDb.from("profiles").select("user_id, full_name, position");
      if (error) throw error;
      return (data as any[] as Profile[]) ?? [];
    },
  });

  const { data: reviewers = [] } = useQuery({
    queryKey: ["360-reviewers", selectedReview],
    enabled: !!selectedReview,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("performance_review_reviewers" as any)
        .select("*")
        .eq("review_id", selectedReview!);
      if (error) throw error;
      return (data as any[] as Reviewer[]) ?? [];
    },
  });

  const invite = useMutation({
    mutationFn: async (p: { reviewer_id: string; role: Reviewer["role"] }) => {
      const { error } = await laravelDb.from("performance_review_reviewers" as any).insert({
        company_id: companyId,
        review_id: selectedReview,
        reviewer_id: p.reviewer_id,
        role: p.role,
        status: "invited",
        invited_by: profile?.user_id,
        invited_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["360-reviewers", selectedReview] });
      setInviteOpen(false);
      toast.success("Ревьюер приглашён");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось пригласить"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("performance_review_reviewers" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["360-reviewers", selectedReview] }),
  });

  const nameOf = (uid: string) => profiles.find((p) => p.user_id === uid)?.full_name || uid.slice(0, 8);
  const reviewee = useMemo(() => reviews.find((r) => r.id === selectedReview) ?? null, [reviews, selectedReview]);
  const stats = useMemo(() => {
    const s = { invited: 0, submitted: 0, declined: 0 };
    for (const r of reviewers) s[r.status] = (s[r.status] ?? 0) + 1;
    return s;
  }, [reviewers]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          360° ревью
        </h1>
        <p className="text-sm text-muted-foreground">Приглашение коллег, руководителей и подчинённых в оценку</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Ревью цикла</CardTitle></CardHeader>
          <CardContent className="space-y-1 max-h-[600px] overflow-auto">
            {reviews.length === 0 && (
              <div className="text-sm text-muted-foreground py-6 text-center">Нет активных ревью</div>
            )}
            {reviews.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedReview(r.id)}
                className={`w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors ${selectedReview === r.id ? "bg-muted" : ""}`}
              >
                <div className="text-sm font-medium">{nameOf(r.user_id)}</div>
                <div className="text-xs text-muted-foreground">{r.status}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {reviewee ? `Ревьюеры для: ${nameOf(reviewee.user_id)}` : "Выберите ревью"}
            </CardTitle>
            {selectedReview && (
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><UserPlus className="w-4 h-4 mr-2" />Пригласить</Button>
                </DialogTrigger>
                <InviteDialog
                  profiles={profiles.filter((p) => p.user_id !== reviewee?.user_id)}
                  onSave={(p) => invite.mutate(p)}
                />
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {!selectedReview ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Выберите ревью слева</div>
            ) : (
              <>
                <div className="flex gap-2 mb-4">
                  <Badge variant="secondary">Приглашено: {stats.invited}</Badge>
                  <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-transparent">Готово: {stats.submitted}</Badge>
                  <Badge variant="destructive">Отклонено: {stats.declined}</Badge>
                </div>
                {reviewers.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">Пока никого не пригласили</div>
                ) : (
                  <div className="space-y-2">
                    {reviewers.map((r) => {
                      const Icon = STATUS_ICON[r.status];
                      return (
                        <div key={r.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                          <div className="flex items-center gap-3">
                            <Icon className={`w-4 h-4 ${STATUS_COLOR[r.status]}`} />
                            <div>
                              <div className="text-sm font-medium">{nameOf(r.reviewer_id)}</div>
                              <div className="text-xs text-muted-foreground">{ROLE_LABEL[r.role]}</div>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => remove.mutate(r.id)}>Удалить</Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InviteDialog({
  profiles,
  onSave,
}: {
  profiles: Profile[];
  onSave: (p: { reviewer_id: string; role: "self" | "manager" | "peer" | "subordinate" | "hr" }) => void;
}) {
  const [uid, setUid] = useState("");
  const [role, setRole] = useState<"peer" | "manager" | "subordinate" | "hr" | "self">("peer");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Пригласить ревьюера</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>Ревьюер</Label>
          <Select value={uid} onValueChange={setUid}>
            <SelectTrigger><SelectValue placeholder="Выбрать" /></SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Роль</Label>
          <Select value={role} onValueChange={(v) => setRole(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="peer">Коллега</SelectItem>
              <SelectItem value="manager">Руководитель</SelectItem>
              <SelectItem value="subordinate">Подчинённый</SelectItem>
              <SelectItem value="hr">HR</SelectItem>
              <SelectItem value="self">Self</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!uid} onClick={() => onSave({ reviewer_id: uid, role })}>Пригласить</Button>
      </DialogFooter>
    </DialogContent>
  );
}
