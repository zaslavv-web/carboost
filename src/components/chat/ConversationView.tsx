import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { chatApi, ChatMessage } from "@/integrations/laravel/chat";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";
import MessageBubble from "./MessageBubble";
import MessageComposer from "./MessageComposer";
import { Reply, X } from "lucide-react";

const ConversationView = ({ conversationId }: { conversationId: string }) => {
  const { t } = useTranslation("chat");
  const { user } = useAuth();
  const { refresh } = useChat();
  const queryClient = useQueryClient();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastReadMessageIdRef = useRef<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === "visible");

  useEffect(() => {
    const onVisibilityChange = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Полная лента диалога читается ОДИН раз и живёт в кэше react-query.
  const { data, isLoading } = useQuery({
    queryKey: ["chat", "messages", conversationId],
    queryFn: async () => {
      const res = await chatApi.messages(conversationId);
      if (res.error) throw new Error(res.error.message);
      return res.data?.data ?? [];
    },
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const messages = useMemo(() => data ?? [], [data]);

  // Дальше подтягиваются ТОЛЬКО новые сообщения (after=created_at последнего),
  // и дописываются в тот же кэш — сервер не перечитывает историю каждые 15 сек.
  useEffect(() => {
    if (!pageVisible || !data) return;
    let cancelled = false;

    const poll = async () => {
      const cached = queryClient.getQueryData<ChatMessage[]>(["chat", "messages", conversationId]);
      const last = cached?.[cached.length - 1];
      if (!last) return;
      const res = await chatApi.messagesSince(conversationId, last.created_at);
      if (cancelled || res.error) return;
      const fresh = res.data?.data ?? [];
      if (fresh.length === 0) return;
      queryClient.setQueryData<ChatMessage[]>(["chat", "messages", conversationId], (prev) => {
        const base = prev ?? [];
        const known = new Set(base.map((m) => m.id));
        return [...base, ...fresh.filter((m) => !known.has(m.id))];
      });
    };

    const timer = window.setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [conversationId, data, pageVisible, queryClient]);

  // Автоскролл вниз при появлении новых сообщений
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Отмечаем прочитанным один раз на последнее входящее сообщение, а не после
  // каждого polling-ответа. Это убирает лишний POST + обновление списка чатов.
  useEffect(() => {
    const lastIncoming = [...messages].reverse().find((message) => message.sender_id !== user?.id);
    const marker = lastIncoming?.id ?? `opened:${conversationId}`;
    if (!pageVisible || lastReadMessageIdRef.current === marker) return;
    lastReadMessageIdRef.current = marker;
    chatApi.markRead(conversationId).then(() => refresh());
  }, [conversationId, messages, pageVisible, refresh, user?.id]);

  const handleSend = async (body: string) => {
    const res = await chatApi.send(conversationId, body, replyTo?.id ?? null);
    if (res.error) return false;
    setReplyTo(null);
    queryClient.invalidateQueries({ queryKey: ["chat", "messages", conversationId] });
    refresh();
    return true;
  };

  const handleReact = async (messageId: string, emoji: string) => {
    await chatApi.toggleReaction(conversationId, messageId, emoji);
    queryClient.invalidateQueries({ queryKey: ["chat", "messages", conversationId] });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
        {!isLoading && messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">{t("noMessages")}</p>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            isOwn={m.sender_id === user?.id}
            currentUserId={user?.id}
            onReply={() => setReplyTo(m)}
            onReact={(emoji) => handleReact(m.id, emoji)}
            replyToBody={
              m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id)?.body ?? null : null
            }
          />
        ))}
      </div>

      {replyTo && (
        <div className="px-3 py-2 border-t border-border bg-secondary/40 flex items-start gap-2">
          <Reply className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-muted-foreground">{t("replyingTo")}</div>
            <div className="text-xs truncate">{replyTo.body}</div>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-secondary rounded" aria-label={t("cancelReply")}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <MessageComposer onSend={handleSend} />
    </div>
  );
};

export default ConversationView;
