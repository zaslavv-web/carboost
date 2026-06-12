import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import ConversationList from "@/components/chat/ConversationList";
import ConversationView from "@/components/chat/ConversationView";
import { useChat } from "@/contexts/ChatContext";

const Chats = () => {
  const { t } = useTranslation("chat");
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const { setActiveConversationId, disabledByImpersonation } = useChat();

  useEffect(() => {
    if (conversationId) setActiveConversationId(conversationId);
  }, [conversationId, setActiveConversationId]);

  if (disabledByImpersonation) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold mb-2">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("impersonationDisabled")}</p>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6">
      <h1 className="text-2xl font-semibold mb-4">{t("title")}</h1>
      <div className="border border-border rounded-xl overflow-hidden bg-card grid grid-cols-1 md:grid-cols-[320px_1fr] h-[calc(100vh-12rem)] min-h-[480px]">
        <div className="border-r border-border min-h-0 flex flex-col">
          <ConversationList onSelect={(id) => navigate(`/chats/${id}`)} />
        </div>
        <div className="min-h-0 flex flex-col">
          {conversationId ? (
            <ConversationView conversationId={conversationId} />
          ) : (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground p-6 text-center">
              {t("noConversations")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Chats;
