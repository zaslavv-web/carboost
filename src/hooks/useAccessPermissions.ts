/**
 * Права текущего пользователя по разделам (ролевая модель компании).
 *
 * Матрица «роль × раздел» настраивается администратором на /access-control,
 * бэкенд возвращает уже схлопнутые по всем ролям пользователя флаги.
 */
import { useQuery } from "@tanstack/react-query";
import { laravel } from "@/integrations/laravel/client";

export interface ResourcePermission {
  can_view: boolean;
  can_edit: boolean;
  can_download: boolean;
}

export type PermissionMap = Record<string, ResourcePermission>;

export function useAccessPermissions() {
  const { data, isLoading } = useQuery({
    queryKey: ["access-control", "me"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await laravel.get<{ permissions: PermissionMap }>("/access-control/me");
      if (error) return {} as PermissionMap;
      return (data?.permissions ?? {}) as PermissionMap;
    },
  });

  const permissions = data ?? {};

  return {
    permissions,
    isLoading,
    // Пока права не загружены, ничего не прячем — иначе меню «мигает».
    canView: (resource: string) => permissions[resource]?.can_view ?? true,
    canEdit: (resource: string) => permissions[resource]?.can_edit ?? true,
    canDownload: (resource: string) => permissions[resource]?.can_download ?? true,
  };
}
