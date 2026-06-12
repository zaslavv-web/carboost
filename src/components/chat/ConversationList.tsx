import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useChat } from "@/contexts/ChatContext";
import ContactSearch from "./ContactSearch";
import { formatDistanceToNowStrict } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import i18n from "@/i18n";

const initialsFor = (name: string | null | undefined) =>
  (name ?? "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

const ConversationList = ({ onSelect }: { onSelect: (id: string) => void }) => {
  const { t } = useTranslation("chat");
  const { conversations, isLoading } = useChat();
  const [query, setQuery] = useState("");
  const dateLocale = i18n.language === "en" ? enUS : ru;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ContactSearch query={query} setQuery={setQuery} onPicked={(id) => onSelect(id)} />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!isLoading && conversations.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center">{t("noConversations")}</p>
        )}
        <ul className="divide-y divide-border">
          {conversations.map((c) => {
            const name = c.peer?.full_name || c.title || "—";
            const preview = c.last_message?.body ?? "";
            const time = c.last_message_at
              ? formatDistanceToNowStrict(new Date(c.last_message_at), { locale: dateLocale, addSuffix: false })
              : "";
            return (
              <li key={c.id}>
                <button
                  onClick={() => onSelect(c.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/60 transition-colors text-left"
                >
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    <AvatarImage src={c.peer?.avatar_url ?? undefined} />
                    <AvatarFallback>{initialsFor(name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{name}</span>
                      {time && <span className="text-[11px] text-muted-foreground flex-shrink-0">{time}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground truncate">{preview}</span>
                      {c.unread_count > 0 && (
                        <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default ConversationList;
