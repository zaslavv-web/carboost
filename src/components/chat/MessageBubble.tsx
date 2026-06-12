import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Smile, Reply } from "lucide-react";
import { ChatMessage } from "@/integrations/laravel/chat";
import { formatDistanceToNowStrict } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import i18n from "@/i18n";

const QUICK_EMOJI = ["👍", "❤️", "😂", "🎉", "🙏", "🔥"];

const MessageBubble = ({
  message,
  isOwn,
  currentUserId,
  onReply,
  onReact,
  replyToBody,
}: {
  message: ChatMessage;
  isOwn: boolean;
  currentUserId?: string;
  onReply: () => void;
  onReact: (emoji: string) => void;
  replyToBody: string | null;
}) => {
  const { t } = useTranslation("chat");
  const [pickerOpen, setPickerOpen] = useState(false);
  const dateLocale = i18n.language === "en" ? enUS : ru;
  const time = formatDistanceToNowStrict(new Date(message.created_at), { locale: dateLocale, addSuffix: true });

  return (
    <div className={`group flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
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
            <button onClick={() => setPickerOpen((v) => !v)} className="p-1 rounded hover:bg-secondary" aria-label={t("react")}>
              <Smile className="w-3 h-3 text-muted-foreground" />
            </button>
            {pickerOpen && (
              <div className="absolute bottom-6 right-0 bg-popover border border-border rounded-lg shadow-lg p-1 flex gap-0.5 z-10">
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
