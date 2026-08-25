import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { chatApi, ChatConversation } from "@/integrations/laravel/chat";
import { useAuth } from "@/contexts/AuthContext";
import { useImpersonation } from "@/contexts/ImpersonationContext";

type ChatContextType = {
  conversations: ChatConversation[];
  isLoading: boolean;
  chatError: string | null;
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
  /** Пометить, что пользователь явно запросил чаты (страница /chats). */
  requestChats: () => void;
};

const ChatContext = createContext<ChatContextType | null>(null);

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside ChatProvider");
  return ctx;
};

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const { user, authReady } = useAuth();
  const { impersonatedUserId } = useImpersonation();
  const queryClient = useQueryClient();
  const enabled = authReady && !!user && !impersonatedUserId;

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  // Список диалогов грузится ТОЛЬКО по явному запросу пользователя: открытие
  // панели чатов или переход на /chats. До этого момента ни один запрос
  // к /api/chats не уходит — на бэкенде это самый тяжёлый endpoint.
  const [chatsRequested, setChatsRequested] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === "visible");

  useEffect(() => {
    const onVisibilityChange = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Сессия сменилась — сбрасываем «запрошенность», чтобы новый пользователь
  // снова не тянул список чатов фоном.
  useEffect(() => {
    setChatsRequested(false);
    setActiveConversationId(null);
    setIsPanelOpen(false);
  }, [user?.id]);

  const listEnabled = enabled && chatsRequested;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["chats", "list", user?.id],
    queryFn: async () => {
      const res = await chatApi.list();
      // Ошибка списка чатов не должна маскироваться под штатное пустое состояние.
      if (res.error) {
        return {
          conversations: [],
          error: res.error.message || "Не удалось загрузить список чатов.",
        };
      }
      if (res.data?.degraded) {
        return {
          conversations: [],
          error: res.data.error_id
            ? `Список чатов временно недоступен. Код: ${res.data.error_id}`
            : "Список чатов временно недоступен.",
        };
      }
      return { conversations: res.data?.data ?? [], error: null };
    },
    enabled: listEnabled,
    retry: false,
    // Список живёт в кэше: повторное открытие панели не бьёт по бэкенду.
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    // Опрос только пока панель реально открыта и вкладка видима.
    refetchInterval: listEnabled && isPanelOpen && pageVisible ? 30_000 : false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Бейдж непрочитанного использует лёгкий COUNT-endpoint, а не полный список
  // диалогов: одна агрегатная строка вместо десятков объектов с участниками.
  // Первый запрос откладываем: сразу после логина фронт и так шлёт пачку
  // запросов (профиль, роли, дашборд), и фоновый бейдж только добавлял
  // параллельный PHP-воркер в самый пиковый момент.
  const [badgeArmed, setBadgeArmed] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setBadgeArmed(false);
      return;
    }
    const t = window.setTimeout(() => setBadgeArmed(true), 15_000);
    return () => window.clearTimeout(t);
  }, [enabled, user?.id]);

  const badgeEnabled = enabled && badgeArmed;

  const { data: unreadFromBadge = 0 } = useQuery({
    queryKey: ["chats", "unread-count", user?.id],
    queryFn: async () => {
      const res = await chatApi.unreadCount();
      if (res.error) return 0;
      return res.data?.unread ?? 0;
    },
    enabled: badgeEnabled,
    retry: false,
    staleTime: 60_000,
    refetchInterval: badgeEnabled && pageVisible ? 120_000 : false,
    refetchOnWindowFocus: false,
  });


  const conversations = data?.conversations ?? [];
  const chatError = data?.error ?? null;
  const unreadFromList = useMemo(
    () => conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0),
    [conversations],
  );
  // Пока список не загружен, показываем значение из лёгкого счётчика.
  const unreadTotal = chatsRequested && data ? unreadFromList : unreadFromBadge;

  const requestChats = useCallback(() => setChatsRequested(true), []);

  const openPanel = useCallback((conversationId?: string) => {
    setChatsRequested(true);
    if (conversationId) setActiveConversationId(conversationId);
    setIsPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const togglePanel = useCallback(() => {
    setIsPanelOpen((v) => {
      if (!v) setChatsRequested(true);
      return !v;
    });
  }, []);

  const openOrCreateDirect = useCallback(
    async (peerUserId: string) => {
      const res = await chatApi.createDirect(peerUserId);
      if (res.error || !res.data?.data?.id) return null;
      const id = res.data.data.id;
      setChatsRequested(true);
      setActiveConversationId(id);
      setIsPanelOpen(true);
      queryClient.invalidateQueries({ queryKey: ["chats", "list", user?.id] });
      return id;
    },
    [queryClient, user?.id],
  );

  const refresh = useCallback(() => {
    if (!chatsRequested) return;
    refetch();
    queryClient.invalidateQueries({ queryKey: ["chats", "unread-count", user?.id] });
  }, [chatsRequested, refetch, queryClient, user?.id]);

  const value: ChatContextType = {
    conversations,
    isLoading: listEnabled ? isLoading : false,
    chatError,
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
    requestChats,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
