import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Check, Info, AlertTriangle, Award, Loader2, Route, ShoppingBag, GraduationCap, ClipboardCheck, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";

const typeConfig: Record<string, { icon: any; color: string }> = {
  info: { icon: Info, color: "bg-info/10 text-info" },
  success: { icon: Check, color: "bg-success/10 text-success" },
  warning: { icon: AlertTriangle, color: "bg-warning/10 text-warning" },
  achievement: { icon: Award, color: "bg-primary/10 text-primary" },
  reward: { icon: Award, color: "bg-primary/10 text-primary" },
  career_track: { icon: Route, color: "bg-info/10 text-info" },
  career_step_passed: { icon: ClipboardCheck, color: "bg-success/10 text-success" },
  career_step_failed: { icon: XCircle, color: "bg-destructive/10 text-destructive" },
  career_step_review: { icon: ClipboardCheck, color: "bg-warning/10 text-warning" },
  shop_order: { icon: ShoppingBag, color: "bg-primary/10 text-primary" },
};

const Notifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
      if (unreadIds.length === 0) return;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", unreadIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Все уведомления отмечены как прочитанные");
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = notifications.filter((n) => !n.is_read).length;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Уведомления</h1>
          <p className="text-muted-foreground text-sm mt-1">{unread} непрочитанных</p>
        </div>
        {unread > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="text-sm text-primary hover:underline"
          >
            Отметить все как прочитанные
          </button>
        )}
      </div>

      <div className="space-y-3">
        {notifications.length > 0 ? notifications.map((n) => {
          const config = typeConfig[n.notification_type as keyof typeof typeConfig] || typeConfig.info;
          return (
            <div
              key={n.id}
              onClick={() => !n.is_read && markReadMutation.mutate(n.id)}
              className={`bg-card rounded-xl p-4 shadow-card border transition-colors cursor-pointer ${
                n.is_read ? "border-border opacity-70" : "border-primary/20 hover:border-primary/40"
              }`}
            >
              <div className="flex gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${config.color}`}>
                  <config.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{n.title}</h3>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                  </div>
                  {n.description && <p className="text-sm text-muted-foreground mt-0.5">{n.description}</p>}
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ru })}
                  </p>
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="bg-card rounded-xl p-12 shadow-card border border-border text-center">
            <Info className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">Нет уведомлений</h3>
            <p className="text-sm text-muted-foreground">Новые уведомления появятся здесь</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
