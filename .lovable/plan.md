## Проблема

`alavrenov@vacollection.asia` (и потенциально все пользователи, кроме superadmin) после входа попадают на `/complete-registration`, хотя у них уже есть `company_id` и `is_verified=true`.

### Корневая причина

1. Хук `useLaravelProfile` (`src/hooks/useLaravelProfile.ts:41-43`) запрашивает `GET /api/profiles/${effectiveId}`, где `effectiveId = user.id` — это id из доменной таблицы `users` (например `"33"`).
2. `ProfileController::show` (`backend-laravel/app/Http/Controllers/Api/ProfileController.php`) делает `Profile::findOrFail($id)` — лукап по primary key таблицы `profiles`, а это **UUID**. `findOrFail("33")` → 404.
3. Хук возвращает `null`, `ProtectedRoute` видит `!profile?.company_id` → редирект на CompleteRegistration.
4. На CompleteRegistration падает второй запрос `/companies/public` (его middleware-цепочка валидна, но к этому моменту user уже застрял).

Подтверждение: `/api/auth/me` тем же токеном возвращает `company_id: a1ef617d-…, is_verified: true, role: hrd` — то есть данные в БД верные, ломается именно фронт-лукап профиля.

## Что меняем

### 1. Backend — `ProfileController::show` принимает user_id

`backend-laravel/app/Http/Controllers/Api/ProfileController.php`

```php
public function show(string $id): JsonResponse
{
    $query = Profile::with(['user', 'company']);

    // Если $id — UUID, ищем по primary key (старый контракт),
    // иначе считаем это user_id (новый фронт-контракт).
    $isUuid = (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id);
    $profile = $isUuid
        ? $query->findOrFail($id)
        : $query->where('user_id', $id)->firstOrFail();

    $this->authorize('view', $profile);
    return response()->json($profile);
}
```

Это сохраняет старое поведение (UUID-лукап для существующих интеграций) и чинит фронт, не трогая остальные места.

### 2. Backend — отдать `roles` в ответе профиля

`AuthController::me` уже отдаёт `roles`, но `ProfileController::show` — нет. Чтобы `useLaravelRoles` при импер­сонации тоже получал роли, в `show`/`me` добавляем:

```php
$payload = $profile->toArray();
$payload['roles'] = \DB::table('user_roles')
    ->where('user_id', $profile->user_id)
    ->pluck('role')->values()->all();
return response()->json($payload);
```

(применяем и в `show`, и в `me`).

### 3. Frontend — fallback хука на `/profiles/me`

`src/hooks/useLaravelProfile.ts` — если не идёт импер­сонация (`effectiveId === user.id`), вызываем `/profiles/me` (он гарантированно резолвит профиль текущего юзера по `auth()->user()`), иначе — `/profiles/{effectiveId}` (по user_id).

```ts
const path =
  effectiveId && effectiveId !== user?.id
    ? `/profiles/${effectiveId}`
    : `/profiles/me`;
```

Это страховка на случай, если deploy backend задержится — фронт всё равно работает.

## Деплой и проверка

1. `git pull` на сервере, `php artisan optimize:clear && php artisan route:cache`, перезагрузка php-fpm.
2. Проверка curl-ом тем же токеном:
   ```bash
   curl -s -i https://growth-peak.pro/api/profiles/33 \
     -H "Authorization: Bearer $TOKEN"
   ```
   Ожидаем `200` + JSON с `company_id: a1ef617d-…` и `roles: ["hrd"]`.
3. Пользователь логинится → сразу попадает на Dashboard (а не CompleteRegistration), в сайдбаре роль «HRD».

## Что НЕ меняем

- Логика `ProtectedRoute` (`!profile?.company_id` → CompleteRegistration) — она корректна, проблема была только в источнике `profile`.
- Маршрут `/companies/public` (фикс прошлой итерации остаётся) — пригодится, когда в систему действительно зайдёт новый пользователь без компании.
- Импер­сонация — `useEffectiveLaravelUserId` остаётся как есть.
