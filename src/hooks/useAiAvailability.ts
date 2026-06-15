/**
 * Хук доступности AI: загружает /api/ai-settings, кэширует и сообщает,
 * включён ли AI в текущей компании. Используется на экранах с AI-кнопками,
 * чтобы либо блокировать действие, либо показать сообщение администратора.
 */
import { useQuery } from "@tanstack/react-query";
import { laravelInvoke } from "@/integrations/laravel/client";

export interface AiSettings {
  provider: string;
  model: string | null;
  api_url: string | null;
  api_key_set: boolean;
  extra: Record<string, unknown>;
  rag_enabled: boolean;
  rag_index_status: string;
  disabled_message: string | null;
  disabled_alert_threshold: number;
  disabled_request_count: number;
}

export function useAiSettings() {
  return useQuery<AiSettings | null>({
    queryKey: ["ai-settings"],
    queryFn: async () => {
      const { data } = await laravelInvoke<AiSettings>("ai-settings", { method: "GET" });
      return data ?? null;
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useAiAvailability() {
  const { data, isLoading } = useAiSettings();
  const disabled = data?.provider === "disabled";
  return {
    isLoading,
    enabled: !disabled,
    disabled,
    disabledMessage:
      data?.disabled_message ||
      "AI отключён администратором продукта. Обратитесь к Company Admin или HRD для подключения.",
    provider: data?.provider ?? null,
  };
}
