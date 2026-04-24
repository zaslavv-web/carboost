import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Heart, Sparkles, Trophy, Coins, Send, Trash2, Award, Lightbulb, HandHeart } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

const CATEGORIES = [
  { value: "thanks", label: "Благодарность", icon: HandHeart, color: "text-rose-500" },
  { value: "achievement", label: "Достижение", icon: Trophy, color: "text-warning" },
  { value: "help", label: "Помощь команде", icon: Sparkles, color: "text-primary" },
  { value: "innovation", label: "Идея/инновация", icon: Lightbulb, color: "text-info" },
  { value: "mentorship", label: "Менторство", icon: Award, color: "text-success" },
];

const Recognition = () => {
  const { data: profile } = useUserProfile();
  const qc = useQueryClient();

  const [recipientId, setRecipientId] = useState<string>("");
  const [category, setCategory] = useState("thanks");
  const [message, setMessage] = useState("");
  const [coins, setCoins] = useState(0);

  const { data: colleagues = [] } = useQuery({
    queryKey: ["colleagues", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, position, avatar_url")
        .eq("company_id", profile!.company_id!)
        .neq("user_id", profile!.user_id)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: feed = [], isLoading } = useQuery({
    queryKey: ["recognitions-feed", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peer_recognitions")
        .select("id, from_user_id, to_user_id, category, message, coin_reward, created_at")
        .eq("company_id", profile!.company_id!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      const userIds = Array.from(new Set([
        ...data.map((r) => r.from_user_id),
        ...data.map((r) => r.to_user_id),
      ]));
      const { data: people = [] } = userIds.length
        ? await supabase
            .from("profiles")
            .select("user_id, full_name, position, avatar_url")
            .in("user_id", userIds)
        : { data: [] as any[] };
      const peopleMap = new Map(people.map((p: any) => [p.user_id, p]));

      const ids = data.map((r) => r.id);
      const { data: reactions = [] } = ids.length
        ? await supabase
            .from("peer_recognition_reactions")
            .select("id, recognition_id, user_id, reaction")
            .in("recognition_id", ids)
        : { data: [] as any[] };

      return data.map((rec) => {
        const recReactions = reactions.filter((r: any) => r.recognition_id === rec.id);
        return {
          ...rec,
          from: peopleMap.get(rec.from_user_id),
          to: peopleMap.get(rec.to_user_id),
          reactions: recReactions,
          likeCount: recReactions.filter((r: any) => r.reaction === "like").length,
          likedByMe: recReactions.some((r: any) => r.user_id === profile?.user_id && r.reaction === "like"),
        };
      });
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id || !profile?.user_id) throw new Error("Нет профиля");
      if (!recipientId) throw new Error("Выберите получателя");
      if (!message.trim()) throw new Error("Напишите сообщение");
      const { error } = await supabase.from("peer_recognitions").insert({
        company_id: profile.company_id,
        from_user_id: profile.user_id,
        to_user_id: recipientId,
        category,
        message: message.trim(),
        coin_reward: coins,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Признание отправлено!");
      setMessage("");
      setRecipientId("");
      setCoins(0);
      qc.invalidateQueries({ queryKey: ["recognitions-feed"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleLike = useMutation({
    mutationFn: async ({ recId, liked }: { recId: string; liked: boolean }) => {
      if (!profile?.user_id) return;
      if (liked) {
        await supabase
          .from("peer_recognition_reactions")
          .delete()
          .eq("recognition_id", recId)
          .eq("user_id", profile.user_id)
          .eq("reaction", "like");
      } else {
        await supabase.from("peer_recognition_reactions").insert({
          recognition_id: recId,
          user_id: profile.user_id,
          reaction: "like",
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recognitions-feed"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("peer_recognitions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Удалено");
      qc.invalidateQueries({ queryKey: ["recognitions-feed"] });
    },
  });

  const initials = (name?: string) =>
    name ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "??";

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl gradient-hero p-6 md:p-8 shadow-elevated">
        <div className="absolute inset-0 gradient-glow opacity-60 pointer-events-none" />
        <div className="relative flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/20 backdrop-blur-md flex items-center justify-center animate-glow-pulse">
            <Heart className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Лента признания</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Поблагодарите коллегу, отметьте достижение или поделитесь идеей. Можно прикрепить игровые монеты — они спишутся с вашего баланса и зачислятся получателю.
            </p>
          </div>
        </div>
      </div>

      {/* Composer */}
      <Card className="glass-strong p-5 md:p-6 shadow-card">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Кому</label>
            <Select value={recipientId} onValueChange={setRecipientId}>
              <SelectTrigger className="bg-background/60">
                <SelectValue placeholder="Выберите коллегу" />
              </SelectTrigger>
              <SelectContent>
                {colleagues.map((c: any) => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    {c.full_name} {c.position ? `· ${c.position}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Категория</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-background/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Сообщение</label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="За что вы благодарите коллегу?"
            rows={3}
            className="bg-background/60 resize-none"
          />
        </div>
        <div className="mt-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Coins className="w-4 h-4 text-warning" />
            <input
              type="range"
              min={0}
              max={500}
              step={10}
              value={coins}
              onChange={(e) => setCoins(Number(e.target.value))}
              className="accent-primary w-40"
            />
            <span className="text-sm font-semibold tabular-nums w-16 text-foreground">{coins} ¢</span>
          </div>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !recipientId || !message.trim()}
            className="gradient-primary text-primary-foreground shadow-glow hover:shadow-elevated"
          >
            <Send className="w-4 h-4 mr-2" />
            Отправить признание
          </Button>
        </div>
      </Card>

      {/* Feed */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground px-1">Последние благодарности</h2>
        {isLoading && (
          <Card className="p-6 text-center text-muted-foreground">Загрузка...</Card>
        )}
        {!isLoading && feed.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">
            <HandHeart className="w-10 h-10 mx-auto mb-3 opacity-50" />
            Пока пусто. Будьте первым, кто поблагодарит коллегу.
          </Card>
        )}
        {feed.map((rec) => {
          const cat = CATEGORIES.find((c) => c.value === rec.category) ?? CATEGORIES[0];
          const Icon = cat.icon;
          const isMine = rec.from_user_id === profile?.user_id;
          return (
            <Card key={rec.id} className="glass p-5 hover-lift animate-scale-in">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-sm font-semibold shrink-0">
                  {initials(rec.from?.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-foreground">{rec.from?.full_name ?? "—"}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-semibold text-foreground">{rec.to?.full_name ?? "—"}</span>
                    <Badge variant="secondary" className="ml-1 gap-1">
                      <Icon className={`w-3 h-3 ${cat.color}`} />
                      {cat.label}
                    </Badge>
                    {rec.coin_reward > 0 && (
                      <Badge className="bg-warning/20 text-warning border-warning/40 gap-1">
                        <Coins className="w-3 h-3" />+{rec.coin_reward}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-foreground leading-relaxed whitespace-pre-wrap">{rec.message}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      onClick={() => toggleLike.mutate({ recId: rec.id, liked: rec.likedByMe })}
                      className={`flex items-center gap-1.5 text-sm transition-colors ${
                        rec.likedByMe ? "text-rose-500" : "text-muted-foreground hover:text-rose-500"
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${rec.likedByMe ? "fill-current" : ""}`} />
                      <span>{rec.likeCount}</span>
                    </button>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(rec.created_at), { addSuffix: true, locale: ru })}
                      </span>
                      {isMine && (
                        <button
                          onClick={() => remove.mutate(rec.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Recognition;
