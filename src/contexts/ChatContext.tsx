import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { chatApi, ChatConversation } from "@/integrations/laravel/chat";
import { useAuth } from "@/contexts/AuthContext";
import { useImpersonation } from "@/contexts/ImpersonationContext";

type ChatContextType = {
  conversations: ChatConversation[];
  isLoading: boolean;
  unreadTotal: number;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  isPanelOpen: boolean;
  openPanel: (conversationId?: string) => void;
  closePanel: () => void;
  togglePanel: () => void;
  refresh: () => void;
  openOrCreateDirect: (peerUserId: string) => Promise<string | null>;
  disabledByImpersonation: boolean;
};

const ChatContext = createContext<ChatContextType | null>(null);

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside ChatProvider");
  return ctx;
};

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { impersonatedUserId } = useImpersonation();
  const queryClient = useQueryClient();
  const enabled = !authLoading && !!user && !impersonatedUserId;

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["chats", "list"],
    queryFn: async () => {
      const res = await chatApi.list();
      if (res.error) throw new Error(res.error.message);
      return res.data?.data ?? [];
    },
    enabled,
    refetchInterval: enabled ? 7000 : false,
    refetchOnWindowFocus: true,
  });

  const conversations = data ?? [];
  const unreadTotal = useMemo(
    () => conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0),
    [conversations],
  );

  const openPanel = useCallback((conversationId?: string) => {
    if (conversationId) setActiveConversationId(conversationId);
    setIsPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const togglePanel = useCallback(() => setIsPanelOpen((v) => !v), []);

  const openOrCreateDirect = useCallback(
    async (peerUserId: string) => {
      const res = await chatApi.createDirect(peerUserId);
      if (res.error || !res.data?.data?.id) return null;
      const id = res.data.data.id;
      setActiveConversationId(id);
      setIsPanelOpen(true);
      queryClient.invalidateQueries({ queryKey: ["chats", "list"] });
      return id;
    },
    [queryClient],
  );

  const refresh = useCallback(() => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["chats"] });
  }, [refetch, queryClient]);

  const value: ChatContextType = {
    conversations,
    isLoading,
    unreadTotal,
    activeConversationId,
    setActiveConversationId,
    isPanelOpen,
    openPanel,
    closePanel,
    togglePanel,
    refresh,
    openOrCreateDirect,
    disabledByImpersonation: !!impersonatedUserId,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
