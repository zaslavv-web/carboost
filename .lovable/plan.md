## Проблема

В `src/pages/UsersManagement.tsx` селект роли строится из `roleLabelMap`, где нет ключа `hr`. Также нет его в `roleBadge`, `priority`-мапе (используется для агрегации ролей пользователя) и в backend-валидации `assignRole`.

## Что править

1. **`src/pages/UsersManagement.tsx`**
   - Добавить `hr: t("users.roleHr")` в `roleLabelMap` (после `hrd`, перед `company_admin` — HR будет в выпадающем списке между ними).
   - Добавить `hr` в `roleBadge` с оформлением уровня HRD (`bg-warning/10 text-warning` или отдельный оттенок).
   - Добавить `hr: 3` (равнозначно HRD) в `priority`-мапу агрегации ролей, чтобы при наличии нескольких ролей HR не «терялся» на фоне employee/manager.

2. **`src/i18n/locales/ru/admin.json` и `src/i18n/locales/en/admin.json`**
   - Добавить ключ `users.roleHr` (`"HR"` / `"HR"`), при необходимости — `users.roleHrShort`.

3. **`backend-laravel/app/Http/Controllers/Api/RpcController.php` → `assignRole()`**
   - В `$allowed` добавить `'hr'`, иначе назначение через RPC вернёт 422 «Недопустимая роль», даже если фронт покажет опцию.
   - Роль `hr` остаётся доступной не-суперадмину (не входит в защищённый список `superadmin`/`company_admin`), что согласуется с ранее принятым решением «HR ≈ HRD по правам».

4. **Проверка**: `tsgo` для фронта, PHP lint для контроллера. Прод: `git pull` + `php artisan route:clear && config:clear` (миграций не требуется — enum `hr` уже добавлен в предыдущем релизе).

## Что НЕ трогаем

Форму создания пользователя (`newRole`), фильтры и остальные экраны — там HR уже поддерживается предыдущим релизом, проблема была только в inline-селекте роли в таблице.
