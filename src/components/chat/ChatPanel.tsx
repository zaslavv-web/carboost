import { useTranslation } from "react-i18next";
import { X, Maximize2, ArrowLeft } from "lucide-react";
import { useChat } from "@/contexts/ChatContext";
import ConversationList from "./ConversationList";
import ConversationView from "./ConversationView";
import { useNavigate } from "react-router-dom";

const ChatPanel = () => {
  const { t } = useTranslation("chat");
  const navigate = useNavigate();
  const { activeConversationId, setActiveConversationId, closePanel, conversations } = useChat();

  const active = conversations.find((c) => c.id === activeConversationId) ?? null;

  return (
    <div className="fixed bottom-24 right-5 z-[60] w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-8rem)] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
      <header className="flex items-center justify-between gap-2 px-3 h-12 border-b border-border bg-card">
        <div className="flex items-center gap-2 min-w-0">
          {activeConversationId && (
            <button
              onClick={() => setActiveConversationId(null)}
              className="p-1.5 rounded-md hover:bg-secondary"
              aria-label={t("back")}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <h2 className="font-semibold text-sm truncate">
            {active?.peer?.full_name || active?.title || t("title")}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              closePanel();
              navigate(activeConversationId ? `/chats/${activeConversationId}` : "/chats");
            }}
            className="p-1.5 rounded-md hover:bg-secondary"
            aria-label={t("openFullscreen")}
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button onClick={closePanel} className="p-1.5 rounded-md hover:bg-secondary" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        {activeConversationId ? (
          <ConversationView conversationId={activeConversationId} />
        ) : (
          <ConversationList onSelect={setActiveConversationId} />
        )}
      </div>
    </div>
  );
};

export default ChatPanel;
