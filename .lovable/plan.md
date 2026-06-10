## Причина 403

В `AnalyticsController::scope()` доступ проверяется через `(array)$user->roles`, но в проекте роли хранятся в отдельной таблице `user_roles` и читаются через `User::hasRole()`. Поле `$user->roles` пустое → 403 отдаётся всем подряд, включая суперадмина.

Та же ошибка в `ingest()`: `role` и `company_id` определяются через несуществующие свойства → в БД летят `null`.

## Что меняю

### 1. Backend — доступ только для суперадмина

Файл: `backend-laravel/app/Http/Controllers/Api/AnalyticsController.php`

- **`scope()`** — переписать на `hasRole('superadmin')` и оставить **только** суперадмина:
  ```php
  $user = $request->user();
  abort_if(!$user, 401);
  $impersonator = $request->attributes->get('impersonator');
  $isSuper = $user->hasRole('superadmin')
      || ($impersonator && $impersonator->hasRole('superadmin'));
  abort_if(!$isSuper, 403, 'Нет доступа к продуктовой аналитике');
  return ['is_super' => true, 'company_id' => $user->companyId()];
  ```
  Никаких `company_admin` / `hrd` — модуль закрыт для всех ролей, кроме superadmin.

- **`ingest()`** — починить определение метаданных (ingest остаётся публичным, событие может прилететь и от незалогиненного посетителя лендинга):
  - `$companyId = $user?->companyId();`
  - `$role` — берём из `user_roles` (одним `select role from user_roles where user_id=? limit 1`), либо `null`.
  - `$impersonator` — id из `$request->attributes->get('impersonator')?->id`.

- Дополнительно на роутах в `backend-laravel/routes/api.php` добавить middleware-страж для отчётных эндпоинтов:
  ```php
  Route::middleware('can:viewProductAnalytics')->group(function () {
      Route::get('/analytics/overview', ...);
      // overview / events / paths / problems / user-timeline / sessions
  });
  ```
  Gate `viewProductAnalytics` объявить в `AuthServiceProvider::boot()`:
  ```php
  Gate::define('viewProductAnalytics', fn (User $u) => $u->hasRole('superadmin'));
  ```
  (контроллерная проверка остаётся как defence-in-depth).

### 2. Frontend — скрыть пункт меню

- `src/components/AppSidebar.tsx` — пункт «Product Analytics» рендерить только если `realRole === 'superadmin'` (использовать `useRealPrimaryRole()`, как в других superadmin-only пунктах).
- `src/App.tsx` — обернуть маршрут `/admin/analytics` в проверку роли; не-суперадминов редиректить на `/dashboard`.
- При импернсонации показывать пункт по **реальной** роли, чтобы суперадмин видел аналитику даже под чужим аккаунтом.

### 3. БД / миграции / локали

Изменений не требуется. Существующие ru/en строки `productAnalytics.*` остаются.

## Проверка

- `GET /api/analytics/overview` под superadmin → 200; под company_admin / hrd / manager / employee → 403.
- Импернсонация суперадмина под обычным юзером → 200, данные scope-ятся по `company_id` impersonated-юзера (можно переопределить `?company_id=`).
- В сайдбаре пункт виден только суперадмину; прямой переход по URL для остальных → редирект.
- `POST /api/analytics/ingest` по-прежнему принимает события и для гостя, и для авторизованного пользователя; в БД заполняются `company_id` / `role` / `impersonated_by`.
