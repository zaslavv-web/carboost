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
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["chat", "messages", conversationId],
    queryFn: async () => {
      const res = await chatApi.messages(conversationId);
      if (res.error) throw new Error(res.error.message);
      return res.data?.data ?? [];
    },
    refetchInterval: 5000,
  });

  const messages = data ?? [];

  // Автоскролл вниз при появлении новых сообщений
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Отметить прочитанным при открытии и при поступлении новых
  useEffect(() => {
    chatApi.markRead(conversationId).then(() => refresh());
  }, [conversationId, messages.length, refresh]);

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
