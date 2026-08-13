import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { laravel } from "@/integrations/laravel/client";

export interface InboxNotification {
  id: string;
  title: string | null;
  body: string | null;
  url: string | null;
  created_at: string;
  is_read: boolean;
  type: string | null;
}

interface InboxResponse {
  data: Array<{
    id: string;
    title: string | null;
    description: string | null;
    notification_type: string | null;
    created_at: string;
    is_read: boolean | number;
  }>;
  unread_count: number;
}

export function useNotificationInbox() {
  const { user, authReady } = useAuth();

  return useQuery({
    queryKey: ["notifications", "inbox", user?.id],
    enabled: authReady && !!user,
    refetchInterval: 60_000,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await laravel.get<InboxResponse>("/employee/notifications");
      if (error) throw new Error(error.message);

      const rows = data?.data ?? [];
      return {
        unreadCount: data?.unread_count ?? rows.length,
        notifications: rows.map((notification): InboxNotification => ({
          id: notification.id,
          title: notification.title,
          body: notification.description,
          url: null,
          created_at: notification.created_at,
          is_read: Boolean(notification.is_read),
          type: notification.notification_type,
        })),
      };
    },
  });
}