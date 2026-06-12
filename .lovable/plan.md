
# План: внутренние чаты внутри компании

## Цель MVP
Сотрудники одной компании могут писать друг другу 1-на-1 в реальном времени. Архитектура заранее готова к групповым чатам, каналам по отделам и тонким правам доступа (расписание, белые/чёрные списки).

## Что увидит пользователь

**Плавающая кнопка-пузырь** в правом нижнем углу (на всех страницах после логина, кроме лендинга/логина):
- Бейдж с количеством непрочитанных
- По клику открывается панель ~380×560px поверх контента

**Внутри панели — два экрана:**
1. **Список диалогов** — аватар, имя, должность, превью последнего сообщения, время, счётчик непрочитанных. Сверху поиск сотрудника по ФИО (только своя компания) → создание/открытие 1:1 диалога.
2. **Переписка** — шапка с собеседником (онлайн-статус), лента сообщений (свои справа, чужие слева), индикатор «печатает…», галочки «доставлено/прочитано», ответ на сообщение (reply), эмодзи-реакции, composer с textarea + emoji picker.

Дополнительно — отдельная страница `/chats` (та же логика, во весь экран) для удобной работы с клавиатуры. Пункт в сайдбаре «Сообщения».

## Бэкенд (Laravel)

**Новые таблицы (миграции):**
- `chat_conversations` — `id, company_id, type ('direct'|'group'|'department'), title, created_by, created_at, updated_at, last_message_at`
- `chat_participants` — `id, conversation_id, user_id, role ('member'|'admin'), joined_at, last_read_at, muted_until`
- `chat_messages` — `id, conversation_id, sender_id, body, reply_to_id (nullable), edited_at, deleted_at, created_at`
- `chat_message_reactions` — `id, message_id, user_id, emoji, created_at`
- `chat_message_reads` — опционально, для group-чатов; в MVP `last_read_at` в participants хватит
- `chat_permissions` *(заготовка под будущее)* — `id, company_id, scope ('company'|'department'|'role'|'user'), allow_send (bool), time_window_start, time_window_end, weekdays (jsonb), whitelist (jsonb), blacklist (jsonb)`

Все таблицы с `company_id`, BelongsToCompany trait, CompanyScope. Индексы на `(conversation_id, created_at)`, `(user_id, conversation_id)`.

**Контроллеры/маршруты (под `/api`, auth+verified+has.company):**
- `GET  /chats` — список диалогов пользователя с превью и unread count
- `POST /chats` — создать direct-чат (body: `peer_user_id`) или group (`type, title, participant_ids[]`); проверка, что все из той же компании; для direct — идемпотентно (вернёт существующий)
- `GET  /chats/{id}/messages?before=&limit=` — пагинация назад
- `POST /chats/{id}/messages` — отправка (`body, reply_to_id?`); проверка прав (на MVP — просто same company); broadcast event
- `PATCH /chats/{id}/read` — обновить `last_read_at`
- `POST /chats/{id}/messages/{mid}/reactions` / `DELETE` — toggle emoji
- `POST /chats/{id}/typing` — broadcast «печатает»
- `GET  /chats/contacts?q=` — поиск сотрудников своей компании

**Политика прав (ChatPolicy):** на MVP единый метод `canSend($user, $conversation)` — проверяет membership и `same company`. Внутри — TODO-hook под будущий `ChatPermissionService` (расписание/whitelist/blacklist) — чтобы потом расширить без переписывания контроллеров.

**Realtime через Reverb** (уже описан в `backend-laravel/REVERB.md`):
- События: `MessageSent`, `MessageRead`, `UserTyping`, `ReactionToggled`
- Приватные каналы: `chat.conversation.{id}` (авторизация через `routes/channels.php` — только участники)
- Канал `chat.user.{userId}` для глобального бейджа непрочитанных

## Фронтенд (React)

**Новые файлы:**
- `src/contexts/ChatContext.tsx` — глобальный store: список диалогов, активный, unread totals, подписки Reverb
- `src/components/chat/ChatLauncher.tsx` — плавающая кнопка с бейджем (рендерится в `AppLayout`)
- `src/components/chat/ChatPanel.tsx` — выезжающая панель
- `src/components/chat/ConversationList.tsx`
- `src/components/chat/ConversationView.tsx` — лента + composer
- `src/components/chat/MessageBubble.tsx` — текст, reply, реакции, статусы
- `src/components/chat/MessageComposer.tsx` — textarea, emoji picker (`emoji-mart` или встроенный набор), submit
- `src/components/chat/ContactSearch.tsx`
- `src/pages/Chats.tsx` — полноэкранный вариант, маршрут `/chats` и `/chats/:conversationId`
- `src/hooks/useChatRealtime.ts` — подписка на Reverb-каналы, инвалидация TanStack Query
- `src/integrations/laravel/chat.ts` — типизированные обёртки над API
- `src/i18n/locales/{ru,en}/chat.json`

**Сайдбар:** пункт «Сообщения» с бейджем для ролей employee/manager/hrd/company_admin (superadmin — глобально видит свой own user).

**Импер­сонизация:** при активной impersonation чат отключён (или явная плашка «Невозможно отправлять сообщения от лица другого пользователя») — для безопасности.

## Заготовки под будущие права (не реализуем сейчас, только структура)
- Таблица `chat_permissions` создаётся пустой
- `ChatPolicy::canSend` всегда вызывает `ChatPermissionService::check()`, который на MVP возвращает `true`
- В админке оставляем TODO-страницу `/admin/chat-permissions` (не в этом плане)

Это позволит позже добавить: окна рабочего времени, whitelist/blacklist, запрет писать руководителям, тихие часы — без миграций структуры данных и без изменений API.

## Что НЕ входит в MVP
- Групповые чаты, каналы по отделам (есть схема, нет UI и роутов)
- Вложения и голосовые
- Push-уведомления (только in-app бейдж + браузерное Notification API опционально)
- Поиск по истории сообщений
- Редактирование/удаление сообщений (оставим soft-delete колонки в схеме, UI — позже)
- Админка прав чатов

## Технические детали
- TanStack Query для кэширования диалогов и сообщений; Reverb-события инвалидируют кэш
- Виртуализация ленты при >100 сообщений — `@tanstack/react-virtual`
- Локализация всех строк (ru/en), бэкенд-ошибки через `translateBackendError`
- Тосты sonner по центру (согласно дизайн-системе)
- Палитра teal/slate, шрифт Inter
