## Проблема

При импersonации из `UsersManagement` (`startImpersonation(user_id, name)`) меняется `impersonatedUserId` и `effectiveId`, но `usePrimaryRole()` всё равно отдаёт `superadmin` — поэтому сайдбар остаётся прежним.

Причина в `useUserRoles` (`src/hooks/useUserProfile.ts`): для импersonированного пользователя роли запрашиваются через `laravelDb.from("user_roles").select("role").eq("user_id", effectiveId)`. Этот «псевдо-Supabase» слой ходит в Laravel, и для большинства таблиц фильтр `eq("user_id", ...)` либо игнорируется (возвращаются роли текущего токена = superadmin), либо запрос падает с 403, и мы тихо ловим в TanStack Query.

## План правок

1) **Бэкенд (Laravel)** — добавить явный read-only endpoint:
   - `GET /api/admin/users/{id}/roles` — доступен только `superadmin`, возвращает массив строк (`["hrd"]`).
   - `GET /api/admin/users/{id}/profile` — то же для профиля (используется уже сейчас через `laravelDb`, но лучше явный маршрут).

2) **Фронтенд** — в `src/hooks/useUserProfile.ts`:
   - В `useUserRoles`: если `impersonatedUserId` задан, дёргать `laravel.get(/admin/users/${effectiveId}/roles)` вместо `laravelDb`.
   - В `useUserProfile`: аналогично для профиля импersonированного пользователя.
   - Оставить fallback на `useAuth().user.roles` только когда импersonации нет.

3) **Инвалидация кеша при старте/остановке импersonации** — в `ImpersonationContext`:
   - В `startImpersonation` / `stopImpersonation` вызывать `queryClient.invalidateQueries({ queryKey: ["user_roles"] })` и `["profile"]`, чтобы сайдбар обновился мгновенно.

4) **Защита от мигания** — в `AppSidebar`:
   - Пока `useUserRoles().isLoading`, показывать тонкий skeleton вместо меню «employee» по умолчанию.

## Технические детали

- Файлы фронта: `src/hooks/useUserProfile.ts`, `src/contexts/ImpersonationContext.tsx`, `src/components/AppSidebar.tsx`.
- Файлы бэка: `backend-laravel/routes/api.php`, `backend-laravel/app/Http/Controllers/Api/Admin/UserAdminController.php` (новый), middleware `role:superadmin`.
- RLS-аналог: в контроллере проверяем `auth()->user()->hasRole('superadmin')`, иначе 403.

## Что НЕ меняем

- Логику самих ролей и список пунктов меню в `AppSidebar` (они уже различаются для HRD и superadmin).
- `ImpersonationBanner` — он работает корректно.
