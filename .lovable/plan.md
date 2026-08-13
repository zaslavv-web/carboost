# 500 на /api/chats/unread-count и «ошибка в карьерных треках»

## Что подтверждено чтением кода (не догадки)

**1. Почему ошибка «вылезает» именно в карьерных треках, а в чатах нет.**
`src/integrations/laravel/client.ts:286-300`: любой ответ со `status >= 500` открывает **глобальный** circuit breaker на 60 секунд. После этого все GET-запросы приложения мгновенно возвращают `503 db_busy` без обращения к серверу.

- Бейдж непрочитанного (`ChatContext.tsx:83-95`) вызывает `/chats/unread-count` **на каждой странице**, раз в 2 минуты. Его собственная ошибка проглатывается (`return 0`), тост не показывается.
- Но breaker уже открыт. Страница «Карьерные треки» (`CareerTracksManagement.tsx`) при входе делает 5 запросов (`positions`, `career_track_templates`, `career_level_actions`, `employee_career_assignments`, `profiles`) — все получают искусственный 503 и рисуют ошибку.
- Страница «Чаты» ошибку списка гасит (`ChatContext.tsx:66-68` — `if (res.error) return []`), поэтому «в чатах всё нормально».

То есть источник один (unread-count), а видно его в другом месте. Это дефект обработки ошибок на фронте, независимо от причины 500.

**2. Почему нет ошибок под суперадмином и при входе «из-под админа».**
Маршрут `/chats/unread-count` стоит в группе `['verified.user','has.company']` (`routes/api.php:225,241`).

```text
superadmin        -> EnsureVerified/EnsureHasCompany выходят на hasRole('superadmin')
impersonation     -> EffectiveUser кладёт impersonator; middleware выходят по нему же
обычный аккаунт   -> isVerified() и companyId() читают profiles + SHOW COLUMNS
```

Подтверждено: `EnsureVerified.php:26-33`, `EnsureHasCompany.php:22-29`, `EffectiveUser.php:22-31`, `CompanyScope.php:26-33`, `BasePolicy.php:19-28`. У суперадмина (и у любого просмотра «из-под админа») весь путь чтения профиля/ролей/скоупа не выполняется вообще — поэтому его ошибки физически не воспроизводятся.

**3. Сам метод `unreadCount()` 500 отдать не может.**
`ChatController.php:286-313` целиком обёрнут в `try/catch (\Throwable)` и при ошибке возвращает 200 c `degraded: true`. Значит 500 приходит **до контроллера**: middleware-путь для не-суперадмина, либо PHP-фатал (память/время), либо ошибка соединения не из `QueryException`. Какой именно — по коду определить нельзя, нужен лог. Диагноз пока не подтверждён, и первый шаг плана — его подтвердить.

## План

### Шаг 1. Достать причину 500 из лога (без изменений кода)

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
grep -n "unread-count\|api_fatal\|api_memory_high\|db_busy\|chat.unreadCount" storage/logs/laravel.log | tail -40
```

Ожидаем одно из трёх: `api_fatal` (файл+строка+пик памяти), `db_busy` (лимит соединений), либо обычный `production.ERROR` со стектрейсом middleware.

### Шаг 2. Диагностика конкретной учётки

Добавить артизан-команду `user:diagnose kafedina@postgroup.ru` (только чтение), которая печатает: `users.id`, `meta.sub`, есть ли строка `profiles` с таким `user_id`, `is_verified`, `company_id`, строки `user_roles`, число `chat_participants`. Это отвечает на вопрос «что особенного в учётке»: аккаунт заведён приглашением, и типовые расхождения — `meta.sub` ≠ `profiles.user_id`, пустой `company_id`, дубли в `chat_participants`.

### Шаг 3. Убрать ложную деградацию всего интерфейса

`client.ts`:
- breaker открывается только по `db_busy` / таймауту / сетевому обрыву, а по «просто 500» — лишь после двух подряд неудач;
- у запроса появляется флаг `background: true` (фоновые бейджи), такие запросы breaker не открывают;
- `/chats/unread-count` и счётчик уведомлений помечаются фоновыми.

Результат: единичный 500 на бейдже больше не ломает страницу карьерных треков.

### Шаг 4. Убрать 500 на самом эндпоинте

- Вынести `/chats/unread-count` из группы `verified.user + has.company` в группу «только auth»: счётчик не выдаёт данных компании, а нынешний гейт добавляет два чтения профиля на каждый вызов.
- Обернуть `EnsureVerified`/`EnsureHasCompany` в `try/catch`: при сбое чтения профиля отдавать 503 `db_busy` вместо голого 500.

### Шаг 5. Проверка

После выкладки: вход под `kafedina@postgroup.ru`, переход на «Карьерные треки», затем повторный `grep` по логу. Критерий — в Network нет 500 на `unread-count` и на странице нет тоста ошибки.

## Технические точки изменения

- `src/integrations/laravel/client.ts` — условия открытия breaker, флаг фонового запроса.
- `src/contexts/ChatContext.tsx`, `src/hooks/useUnreadNotifications.ts` — пометить фоновыми.
- `backend-laravel/routes/api.php` — перенос маршрута `unread-count`.
- `backend-laravel/app/Http/Middleware/EnsureVerified.php`, `EnsureHasCompany.php` — защита от исключений.
- `backend-laravel/app/Console/Commands/DiagnoseUser.php` — новая read-only команда.
