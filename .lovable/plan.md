# Диагностика показала: дело не в данных и не в запросе

## Что дали ваши команды

- `diag:memory` под этой учёткой: пик **12 МБ**, все стадии по +0.0 МБ, включая сам запрос unread-count (вернул 0). Ни загрузка прав, ни чтение профиля, ни SQL памяти не едят.
- `user:diagnose`: учётка полностью здоровая — профиль есть, `is_verified=true`, `company_id` заполнен, роль `hrd`, дублей в `chat_participants` нет (их вообще 0).

Значит две гипотезы закрыты: «битые данные у kafedina» и «тяжёлый SQL счётчика». Обе неверны.

Остаётся третья, и она подтверждается косвенно: `diag:memory` печатает `memory_limit=64M` — это **CLI**, отдельный php.ini. Веб-процесс работает с 256M (это же число было в `api_fatal`: 268435456 байт). То есть один и тот же код в CLI укладывается в 12 МБ, а в вебе выедает 256 МБ. Разница — только HTTP-конвейер: Sanctum (у пользователя 19 активных токенов), `EffectiveUser`, глобальные scope, сессия middleware. Где именно — пока **не подтверждено**, и план начинается с замера, а не с правок.

## Шаг 1. Снять цифры с веба, а не с CLI

`MemoryWatchdog` уже пишет `boot_mb` / `entry_mb` / `handler_mb`. Нужен один живой запрос с реальным токеном:

- дёрнуть `/api/chats/unread-count` и `/api/health` под токеном kafedina;
- прочитать в `storage/logs/laravel.log` строки `api_memory_high` и `chat.unreadCount failed` с их `error_id`.

Если `boot_mb` в вебе уже под сотню МБ, а `handler_mb` мал — виноват бутстрап/конвейер, и дальше режем его. Если наоборот — виноват конкретный обработчик.

## Шаг 2. Проверить, повторяется ли 500 после выкладки

Маршрут `/chats/unread-count` теперь вне `verified.user + has.company`, а middleware отдают 503 вместо 500. Нужно понять, исчез ли симптом:

- зайти под kafedina, открыть «Карьерные треки» и подержать страницу пару минут;
- в консоли браузера проверить статус фонового `unread-count`;
- в логе проверить отсутствие новых `api_fatal`.

Возможны три исхода, и каждый ведёт в свою сторону: 200 — корень был в гейте; 503 `degraded` — падает чтение профиля в middleware; снова 500 — падение вне контроллера, и тогда смотрим `error_id` из глобального обработчика.

## Шаг 3. Выровнять лимит CLI

`memory_limit=64M` в CLI — отдельная проблема: сидеры (150 пользователей, 1000 задач, 1500 сообщений) и артизан-команды будут падать на ровном месте, хотя веб настроен на 256M. Добавить `-d memory_limit=256M` в вызовы артизана из GitHub Actions либо прописать лимит в CLI-ini.

## Шаг 4. Сузить бутстрап (только если шаг 1 покажет большой boot_mb)

Кандидаты по убыванию подозрительности: разрешения Spatie, загружаемые целиком; резолв пользователя Sanctum при 19 токенах; `EffectiveUser` + глобальные scope на каждой модели. Трогаем только то, что покажет замер.

## Технические точки

- Замер: `MemoryWatchdog.php` (уже пишет baseline), лог `storage/logs/laravel.log`.
- Лимит CLI: `.github/workflows/deploy-backend.yml`, вызовы `php artisan`.
- Правки бутстрапа: `bootstrap/app.php`, `AppServiceProvider.php`, `EffectiveUser.php` — только после шага 1.

## Команды для шага 1

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
TOKEN='<токен kafedina из localStorage>'
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" https://growth-peak.pro/api/chats/unread-count
curl -s -H "Authorization: Bearer $TOKEN" https://growth-peak.pro/api/chats/unread-count; echo
grep -E 'api_memory_high|api_fatal|chat.unreadCount failed' storage/logs/laravel.log | tail -20
```
