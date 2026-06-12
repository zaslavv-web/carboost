import { useQuery } from "@tanstack/react-query";
import { geoApi, type GeoInfo } from "@/integrations/laravel/geo";

const FALLBACK: GeoInfo = {
  country: null,
  is_ru: false,
  providers: { email: true, google: true, yandex: true },
  reason: null,
};

/**
 * Возвращает список доступных способов входа для текущего IP.
 * Для пользователей из РФ Google скрывается, остаются Yandex ID + email/password.
 * При ошибке/недоступности бэка — fallback показывает все провайдеры (мягкая деградация).
 */
export const useAuthProviders = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["auth", "providers"],
    queryFn: async () => {
      const res = await geoApi.info();
      if (res.error || !res.data) return FALLBACK;
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  return {
    geo: data ?? FALLBACK,
    loading: isLoading,
  };
};
