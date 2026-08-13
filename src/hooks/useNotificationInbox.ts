import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { laravel } from "@/integrations/laravel/client";
import type { TrackerTask } from "@/hooks/tracker";

export interface InboxNotification {
  id: string;
  title: string | null;
  body: string | null;
  url: string | null;
  created_at: string;
  is_read: boolean;
  type: string | null;
}

interface NotificationRow {
    id: string;
    title: string | null;
    description: string | null;
    notification_type: string | null;
    created_at: string;
    is_read: boolean | number;
}

export interface EmployeeTodayData {
  tasks: TrackerTask[];
  notifications: NotificationRow[];
  unread_count: number;
  competencies: Array<{ skill_value: number }>;
  goals: Array<{ id: string; title: string; status: string; progress: number }>;
}

export function useEmployeeTodayData() {
  const { user, authReady } = useAuth();

  return useQuery({
    queryKey: ["employee", "today", user?.id],
    enabled: authReady && !!user,
    refetchInterval: 60_000,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await laravel.get<EmployeeTodayData>("/employee/today");
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useNotificationInbox() {
  const query = useEmployeeTodayData();
  const rows = query.data?.notifications ?? [];

  return {
    ...query,
    data: query.data ? {
      unreadCount: query.data.unread_count ?? rows.length,
      notifications: rows.map((notification): InboxNotification => ({
        id: notification.id,
        title: notification.title,
        body: notification.description,
        url: null,
        created_at: notification.created_at,
        is_read: Boolean(notification.is_read),
        type: notification.notification_type,
      })),
    } : undefined,
  };
}