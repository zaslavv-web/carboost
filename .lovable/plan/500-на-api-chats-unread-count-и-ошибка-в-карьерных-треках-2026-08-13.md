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

ответ:
```

[gro7659365@gro7659365 backend]$ grep -n "unread-count\|api_fatal\|api_memory_hi                                                                                                             gh\|db_busy\|chat.unreadCount" storage/logs/laravel.log | tail -40

36409:[2026-08-13 15:35:59] production.ERROR: api_fatal {"error_id":"e59e5222","                                                                                                             uri":"/api/chats","message":"Allowed memory size of 268435456 bytes exhausted (t                                                                                                             ried to allocate 8388608 bytes)","file":"/home/gro7659365/[growth-peak.pro/docs/b](http://growth-peak.pro/docs/b)                                                                                                             ackend/vendor/laravel/framework/src/Illuminate/Collections/Collection.php:399","                                                                                                             peak_memory":"250MB","memory_limit":"256M"}

36410:[2026-08-13 18:37:55] production.WARNING: api_memory_high {"uri":"/api/ana                                                                                                             lytics/ingest","method":"POST","user_id":null,"status":202,"peak_mb":132.0,"limi                                                                                                             t":"256M"}

36411:[2026-08-13 18:37:57] production.ERROR: api_fatal {"error_id":"2724a4e3","                                                                                                             uri":"/api/chats/unread-count","message":"Allowed memory size of 268435456 bytes                                                                                                              exhausted (tried to allocate 4096 bytes)","file":"/home/gro7659365/growth-peak.                                                                                                             pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Colle                                                                                                             ction.php:260","peak_memory":"256MB","memory_limit":"256M"}

36412:[2026-08-13 18:45:11] production.ERROR: api_fatal {"error_id":"d9776272","                                                                                                             uri":"/api/db/notifications?select=id&count=exact&head=1&eq.user_id=1259&[eq.is](http://eq.is)_r                                                                                                             ead=false","message":"Allowed memory size of 268435456 bytes exhausted (tried to                                                                                                              allocate 8388608 bytes)","file":"/home/gro7659365/[growth-peak.pro/docs/backend/](http://growth-peak.pro/docs/backend/)                                                                                                             vendor/laravel/framework/src/Illuminate/Collections/Collection.php:141","peak_me                                                                                                             mory":"250MB","memory_limit":"256M"}

Это полная дичь...мы одну и ту же ошибку ловим сегодня целый день, потрачено уйма кредитов и с места мы не сдвинулись ни на грамм

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