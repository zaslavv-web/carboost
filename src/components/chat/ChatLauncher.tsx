import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";
import { useChat } from "@/contexts/ChatContext";
import ChatPanel from "./ChatPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "react-router-dom";

const HIDDEN_ROUTES = ["/", "/login", "/reset-password", "/pricing"];

const ChatLauncher = () => {
  const { t } = useTranslation("chat");
  const { user } = useAuth();
  const location = useLocation();
  const { isPanelOpen, togglePanel, unreadTotal, disabledByImpersonation } = useChat();

  if (!user) return null;
  if (HIDDEN_ROUTES.includes(location.pathname)) return null;
  if (location.pathname.startsWith("/feature/")) return null;
  // Скрыть на полноэкранной странице /chats — там и так есть полный UI
  if (location.pathname.startsWith("/chats")) return null;
  if (disabledByImpersonation) return null;

  return (
    <>
      <button
        onClick={togglePanel}
        aria-label={t("launcher")}
        className="fixed bottom-5 right-5 z-[60] h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center group"
      >
        <MessageCircle className="w-6 h-6" />
        {unreadTotal > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center border-2 border-background">
            {unreadTotal > 99 ? "99+" : unreadTotal}
          </span>
        )}
      </button>
      {isPanelOpen && <ChatPanel />}
    </>
  );
};

export default ChatLauncher;
