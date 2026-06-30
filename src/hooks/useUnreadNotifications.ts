import { useQuery } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Возвращает количество непрочитанных уведомлений текущего пользователя.
 * Используется индикатором (красная точка) в шапке.
 */
export function useUnreadNotifications() {
  const { user, loading } = useAuth();
  const { data = 0 } = useQuery({
    queryKey: ["notifications", "unread-count", user?.id],
    enabled: !loading && !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("notifications")
        .select("id")
        .eq("user_id", user!.id)
        .eq("is_read", false);
      if (error) return 0;
      return (data ?? []).length;
    },
  });
  return data as number;
}
