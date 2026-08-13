# Диагностика памяти: почему пришло «Unauthenticated»

## Что произошло в вашей консоли

Сервер отработал корректно. Деплой встал, кэш очищен, `/api/health` отвечает:
`memory_limit 256M`, `boot_mb 38`, `app_debug false`, `opcache on` — база в порядке.

Ответ `{"message":"Unauthenticated."}` — это не старая ошибка и не регресс. Вы подставили в переменную буквальную строку-подсказку:

```text
TOKEN='<токен kafedina из localStorage>'
```

То есть в заголовок `Authorization: Bearer` ушёл текст `<токен kafedina из localStorage>`, а не реальный токен Sanctum. Роут `/api/diag/request-memory` защищён `auth:sanctum`, поэтому он честно вернул 401. Раньше та же фраза появлялась по другой причине (роут был за тяжёлыми middleware / токен протух) — сейчас это просто отсутствующий токен.

## Что было исправлено ранее (и подтверждается вашим выводом)

- Лимит памяти веб-процесса поднят до 256M — видно в `/api/health`.
- Базовое потребление фреймворка — 38 МБ, а не сотни: старт запроса больше не проблема.
- `/api/chats/unread-count` вынесен в лёгкую группу `auth:sanctum`, вне `verified` / `has.company`.
- Добавлен роут `/api/diag/request-memory` с постадийным замером памяти (вход в роут → резолв пользователя → чтение профиля → тяжёлый запрос unread).
- Фронт: бейдж чатов грузится отложенно, фоновые запросы больше не размыкают «предохранитель» клиента.

## Как получить настоящий токен и завершить замер

1. Войти в `https://growth-peak.pro` под учёткой `kafedina@postgroup.ru`.
2. Открыть DevTools → Application → Local Storage → домен `growth-peak.pro` → скопировать значение ключа `laravel_token`.
3. На сервере выполнить (без угловых скобок):

```text
TOKEN='вставленное_значение'
curl -s -H "Authorization: Bearer $TOKEN" https://growth-peak.pro/api/diag/request-memory; echo
curl -s -H "Authorization: Bearer $TOKEN" https://growth-peak.pro/api/chats/unread-count; echo
```

Ожидаемый ответ первого запроса — JSON со стадиями `route_entry`, `after_user`, `after_profile`, `after_unread_query` и пиком памяти.

## Что делаю дальше по вашим цифрам

- Если рост памяти на стадии `after_user` — правим резолв пользователя (Sanctum + связанные модели, ролевые загрузки).
- Если на `after_profile` — правим выборку профиля и глобальные scope.
- Если на `after_unread_query` — переписываем агрегат unread на подзапрос без `distinct()` по join.
- Если пик остаётся низким, а `api_fatal` больше не появляется — фиксируем проблему как закрытую и убираем диагностический роут.

## Технические детали

- Диагностический роут: `backend-laravel/routes/api.php`, группа `auth:sanctum`, строка ~231.
- `/api/chats/unread-count` объявлен вне `verified`/`has.company` (строка ~225), чтобы 500 в бейдже не ломал остальные страницы.
- Ключ токена на фронте: `laravel_token` (см. `src/lib/authStorage.ts`).
- Альтернатива ручному копированию токена: одноразовая artisan-команда, печатающая plain-text токен для указанного email (`personal_access_tokens`), если доступ к DevTools неудобен.
