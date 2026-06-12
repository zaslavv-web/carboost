## Дополнение к чатам: Суперадмин и Техподдержка

### 1. Суперадмин — глобальный отправитель
- В `ChatController@searchContacts`: если `auth()->user()->role === 'superadmin'`, снимаем фильтр по `company_id` — суперадмин видит и может начать чат с любым пользователем платформы.
- В `ChatPolicy@canSend` (и `ChatPermissionService`): суперадмин всегда `true`, минуя любые будущие ограничения (time windows / whitelist / blacklist / quiet hours).
- В `ChatController@startDirect`: разрешаем создание `direct` диалога, где участники из разных `company_id`, только если инициатор или получатель — суперадмин. Для обычных пользователей сохраняется строгая проверка одной компании.
- Запись `chat_conversations.company_id`: для смешанных диалогов (с суперадмином) пишем `company_id` обычного пользователя; если оба суперадмины — `null`.
- RLS/scope в `ChatConversation::visibleTo($user)`: суперадмин видит все диалоги; остальные — только те, где они в `chat_participants`.

### 2. Контакт «Техподдержка» в каждой компании
- В БД создаём одного системного пользователя `support@career-track.app` с ролью `superadmin` и флагом `is_support = true` (новая boolean-колонка на `users`, default false). Это единый аккаунт на всю платформу, а не дубль на компанию.
- Миграция `0009_..._add_is_support_to_users.php` + сидер `SupportUserSeeder`, создающий/обновляющий запись.
- В `ChatController@listContacts` (и `searchContacts`) для любого не-суперадмина: к результатам подмешиваем пользователя с `is_support = true`, всегда первым, с лейблом `chat.support.title` («Техподдержка») и аватаром-иконкой.
- В `startDirect`: если получатель `is_support`, разрешаем кросс-компанийный диалог (как с суперадмином), `company_id` диалога = company инициатора.
- Связь с тикетами: при первом сообщении в чат техподдержки опционально создаём `support_ticket` через существующий `SupportService` (источник = `chat`), чтобы HRD/админы видели обращение в существующей системе тикетов. Включается флагом, по умолчанию — только чат, без тикета (можно решить отдельно).

### 3. Frontend
- `ContactSearch.tsx`: 
  - для superadmin — глобальный поиск по всем компаниям, в строке результата показываем название компании; 
  - для остальных — закреплённая сверху карточка «Техподдержка» (иконка `LifeBuoy`, бейдж «24/7»), затем коллеги.
- `ConversationList.tsx`: диалог с техподдержкой пиннится наверх и помечается иконкой.
- `MessageBubble.tsx`: сообщения от `is_support`/superadmin получают значок «Поддержка»/«Администратор платформы».
- i18n (`ru/chat.json`, `en/chat.json`): ключи `support.title`, `support.subtitle`, `support.badge`, `roles.superadmin_badge`.

### 4. Безопасность
- `canSend` для обычного пользователя: получатель должен быть либо из той же `company_id`, либо `is_support = true`, либо `role = superadmin`. Иначе 403.
- Суперадмин и техподдержка не отображаются в обычных списках сотрудников компании вне модуля чатов (исключение в существующих запросах `users where company_id = ...`, добавляем `where is_support = false and role != 'superadmin'` где нужно, чтобы не сломать аналитику/оргструктуру).

### Технические детали
- Файлы:
  - `backend-laravel/database/migrations/0009_00_00_000000_add_is_support_to_users.php`
  - `backend-laravel/database/seeders/SupportUserSeeder.php` (+ регистрация в `DatabaseSeeder`)
  - правки: `ChatController.php`, `ChatPermissionService.php`, `ChatConversation.php`
  - правки: `src/components/chat/ContactSearch.tsx`, `ConversationList.tsx`, `MessageBubble.tsx`, `ChatContext.tsx`
  - i18n: `src/i18n/locales/{ru,en}/chat.json`
- После деплоя: `php artisan migrate && php artisan db:seed --class=SupportUserSeeder`.

### Открытый вопрос
Создавать ли автоматически `support_ticket` при первом сообщении в чат техподдержки, или техподдержка работает только как чат (тикеты — отдельная форма)?
