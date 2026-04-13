import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePrimaryRole } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import { LifeBuoy, Plus, Clock, Loader2, MessageSquare, Sparkles, ChevronDown, ChevronUp, Send, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";

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

const TicketCard = ({ ticket, profiles, isAdmin, userId }: {
  ticket: any; profiles: any[]; isAdmin: boolean; userId: string;
}) => {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [response, setResponse] = useState(ticket.admin_response || "");
  const [aiLoading, setAiLoading] = useState(false);
  const [status, setStatus] = useState(ticket.status);

  const author = profiles.find((p: any) => p.user_id === ticket.user_id);
  const responder = ticket.responded_by ? profiles.find((p: any) => p.user_id === ticket.responded_by) : null;

  const respondMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("support_tickets").update({
        admin_response: response,
        responded_by: userId,
        responded_at: new Date().toISOString(),
        status,
      } as any).eq("id", ticket.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support_tickets"] });
      toast.success("Ответ сохранён");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const generateAiSuggestion = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-ticket-fix", {
        body: { subject: ticket.subject, description: ticket.description },
      });
      if (error) throw error;
      if (data?.suggestion) {
        setResponse(data.suggestion);
        // Save AI suggestion
        await supabase.from("support_tickets").update({
          ai_suggestion: data.suggestion,
        } as any).eq("id", ticket.id);
        toast.success("AI сгенерировал предложение");
      }
    } catch (e: any) {
      toast.error(e.message || "Ошибка AI");
    } finally {
      setAiLoading(false);
    }
  };

  const p = priorityLabels[ticket.priority] || priorityLabels.medium;
  const s = statusLabels[ticket.status] || statusLabels.open;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground">{ticket.subject}</p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {author && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {author.full_name || "Без имени"}
                  {author.position && <span className="opacity-70">· {author.position}</span>}
                  {author.department && <span className="opacity-70">· {author.department}</span>}
                </span>
              )}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ru })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.cls}`}>{p.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>
            {ticket.admin_response && <MessageSquare className="w-4 h-4 text-success" />}
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {ticket.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Описание проблемы:</p>
              <p className="text-sm text-foreground bg-secondary/30 rounded-lg p-3">{ticket.description}</p>
            </div>
          )}

          {/* Existing response */}
          {ticket.admin_response && !isAdmin && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> Ответ техподдержки:
              </p>
              <div className="text-sm text-foreground bg-primary/5 rounded-lg p-3 prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{ticket.admin_response}</ReactMarkdown>
              </div>
              {responder && (
                <p className="text-xs text-muted-foreground mt-1">
                  Ответил: {responder.full_name} · {ticket.responded_at && formatDistanceToNow(new Date(ticket.responded_at), { addSuffix: true, locale: ru })}
                </p>
              )}
            </div>
          )}

          {/* Admin response form */}
          {isAdmin && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Ответ:</p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={generateAiSuggestion} disabled={aiLoading}>
                    {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    AI подсказка
                  </Button>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="text-xs px-2 py-1 rounded-lg bg-secondary text-foreground border-none focus:outline-none focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="open">Открыт</option>
                    <option value="in_progress">В работе</option>
                    <option value="resolved">Решён</option>
                  </select>
                </div>
              </div>
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="Напишите ответ пользователю..."
                rows={4}
                className="w-full px-4 py-2.5 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
              />
              {ticket.ai_suggestion && !response && (
                <div className="bg-primary/5 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Предложение AI:
                  </p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">{ticket.ai_suggestion}</p>
                  <Button size="sm" variant="ghost" className="mt-2 text-xs" onClick={() => setResponse(ticket.ai_suggestion)}>
                    Использовать как ответ
                  </Button>
                </div>
              )}
              <Button size="sm" onClick={() => respondMutation.mutate()} disabled={!response.trim() || respondMutation.isPending}>
                {respondMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Отправить ответ
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Support = () => {
  const { user } = useAuth();
  const role = usePrimaryRole();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");

  const isAdmin = ["superadmin", "hrd", "company_admin"].includes(role);

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

  const { data: profiles = [] } = useQuery({
    queryKey: ["all_profiles_support"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name, position, department, avatar_url");
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin,
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
          <p className="text-muted-foreground text-sm mt-1">
            {isAdmin ? "Управление обращениями и ответы пользователям" : "Создавайте обращения и отслеживайте их статус"}
          </p>
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

      {isAdmin && tickets.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Всего: {tickets.length}</span>
          <span className="text-warning">Открыто: {tickets.filter((t: any) => t.status === "open").length}</span>
          <span className="text-info">В работе: {tickets.filter((t: any) => t.status === "in_progress").length}</span>
          <span className="text-success">Решено: {tickets.filter((t: any) => t.status === "resolved").length}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16">
          <LifeBuoy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Обращений пока нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t: any) => (
            <TicketCard key={t.id} ticket={t} profiles={profiles} isAdmin={isAdmin} userId={user!.id} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Support;
