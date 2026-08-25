import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, Smile, Reply } from "lucide-react";
import { ChatMessage } from "@/integrations/laravel/chat";
import { formatDistanceToNowStrict } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import i18n from "@/i18n";
import { Link } from "react-router-dom";
import { resolveUrl } from "@/lib/utils";

const QUICK_EMOJI = ["👍", "❤️", "😂", "🎉", "🙏", "🔥"];

const MessageBubble = ({
  message,
  isOwn,
  currentUserId,
  onReply,
  onReact,
  onDirectMessage,
  replyToBody,
  senderName,
  senderAvatar,
}: {
  message: ChatMessage;
  isOwn: boolean;
  currentUserId?: string;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onDirectMessage?: () => void;
  replyToBody: string | null;
  senderName?: string;
  senderAvatar?: string;
}) => {
  const { t } = useTranslation("chat");
  const [pickerOpen, setPickerOpen] = useState(false);
  const dateLocale = i18n.language === "en" ? enUS : ru;
  const time = formatDistanceToNowStrict(new Date(message.created_at), { locale: dateLocale, addSuffix: true });
  const avatarSrc = resolveUrl(senderAvatar);

  return (
    <div className={`group flex ${isOwn ? "justify-end" : "justify-start"}`}>
      {!isOwn && (
        <Link to={`/users/${message.sender_id}`} className="mr-2 mt-1 flex-shrink-0" title={senderName}>
          {avatarSrc ? (
            <img src={avatarSrc} alt={senderName || ""} className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <span className="w-7 h-7 rounded-full bg-secondary text-[11px] flex items-center justify-center text-muted-foreground">
              {(senderName || "?").trim().charAt(0).toUpperCase()}
            </span>
          )}
        </Link>
      )}
      <div className={`max-w-[80%] flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && senderName && (
          <Link
            to={`/users/${message.sender_id}`}
            className="text-[11px] text-muted-foreground hover:underline mb-0.5 text-left"
            title={senderName}
          >
            {senderName}
          </Link>
        )}
        <div
          className={`rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap ${
            isOwn ? "bg-primary text-primary-foreground rounded-br-md" : "bg-secondary text-foreground rounded-bl-md"
          }`}
        >
          {replyToBody && (
            <div className={`mb-1 text-[11px] border-l-2 pl-2 truncate opacity-80 ${isOwn ? "border-primary-foreground/50" : "border-foreground/30"}`}>
              {replyToBody}
            </div>
          )}
          {message.body}
        </div>

        {message.reactions.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {message.reactions.map((r) => {
              const mine = currentUserId ? r.user_ids.includes(currentUserId) : false;
              return (
                <button
                  key={r.emoji}
                  onClick={() => onReact(r.emoji)}
                  className={`text-xs rounded-full px-1.5 py-0.5 border transition ${
                    mine ? "bg-primary/15 border-primary/40" : "bg-card border-border hover:bg-secondary"
                  }`}
                >
                  <span className="mr-1">{r.emoji}</span>
                  <span className="text-[10px] text-muted-foreground">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{time}</span>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 relative">
            <button onClick={onReply} className="p-1 rounded hover:bg-secondary" aria-label={t("reply")}>
              <Reply className="w-3 h-3 text-muted-foreground" />
            </button>
            {!isOwn && onDirectMessage && (
              <button onClick={onDirectMessage} className="p-1 rounded hover:bg-secondary" aria-label={t("directMessage")} title={t("directMessage")}>
                <MessageCircle className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
            <button onClick={() => setPickerOpen((v) => !v)} className="p-1 rounded hover:bg-secondary" aria-label={t("react")}>
              <Smile className="w-3 h-3 text-muted-foreground" />
            </button>
            {pickerOpen && (
              <div
                className={`absolute bottom-6 bg-popover border border-border rounded-lg shadow-lg p-1 flex gap-0.5 z-50 max-w-[calc(100vw-2rem)] ${
                  isOwn ? "right-0" : "left-0"
                }`}
              >
                {QUICK_EMOJI.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      onReact(e);
                      setPickerOpen(false);
                    }}
                    className="text-lg hover:bg-secondary rounded p-1 leading-none"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
