import { useNotificationInbox } from "@/hooks/useNotificationInbox";

/**
 * Возвращает количество непрочитанных уведомлений текущего пользователя.
 * Используется индикатором (красная точка) в шапке.
 */
export function useUnreadNotifications() {
  const { data } = useNotificationInbox();
  return data?.unreadCount ?? 0;
}
