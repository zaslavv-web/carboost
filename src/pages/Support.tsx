import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { LifeBuoy, Plus, Clock, CheckCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

const priorityLabels: Record<string, { label: string; cls: string }> = {
  low: { label: "Низкий", cls: "bg-muted text-muted-foreground" },
  medium: { label: "Средний", cls: "bg-warning/10 text-warning" },
  high: { label: "Высокий", cls: "bg-destructive/10 text-destructive" },
};

const statusLabels: Record<string, { label: string; cls: string }> = {
  open: { label: "Открыт", cls: "bg-info/10 text-info" },
  in_progress: { label: "В работе", cls: "bg-warning/10 text-warning" },
  resolved: { label: "Решён", cls: "bg-success/10 text-success" },
};

const Support = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support_tickets", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("support_tickets").insert({
        user_id: user!.id,
        subject,
        description,
        priority,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support_tickets"] });
      toast.success("Обращение создано");
      setShowForm(false);
      setSubject("");
      setDescription("");
      setPriority("medium");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Техподдержка</h1>
          <p className="text-muted-foreground text-sm mt-1">Создавайте обращения и отслеживайте их статус</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Новое обращение
        </button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h3 className="font-semibold text-foreground">Новое обращение</h3>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Тема обращения"
            className="w-full px-4 py-2.5 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Опишите проблему подробно..."
            rows={4}
            className="w-full px-4 py-2.5 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
          />
          <div className="flex items-center gap-4">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="px-3 py-2 rounded-lg bg-secondary text-foreground text-sm border-none focus:outline-none focus:ring-2 focus:ring-ring/20"
            >
              <option value="low">Низкий приоритет</option>
              <option value="medium">Средний приоритет</option>
              <option value="high">Высокий приоритет</option>
            </select>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!subject.trim() || createMutation.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Отправить"}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16">
          <LifeBuoy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">У вас пока нет обращений</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t: any) => {
            const p = priorityLabels[t.priority] || priorityLabels.medium;
            const s = statusLabels[t.status] || statusLabels.open;
            return (
              <div key={t.id} className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{t.subject}</p>
                    {t.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.cls}`}>{p.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: ru })}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Support;
