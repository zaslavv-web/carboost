## Что сделаю

Одна новая artisan-команда `backend-laravel/app/Console/Commands/SeedChatsAndComments.php`:

```
php artisan chats:seed
  --owner-email=growthpeak@yandex.ru
  --dm-count=40           # 1:1 диалогов
  --group-count=10        # групповых/отдельских чатов
  --msg-per-conv=30       # среднее сообщений на диалог (±10)
  --task-comments-ratio=30  # % задач с комментариями
  --task-comments-max=3   # верхняя граница комментов на задачу
  --marker=chats150
  --reset
  --dry-run
```

### 1. Чаты между сотрудниками (`chat_conversations` / `chat_participants` / `chat_messages`)

- Пул участников — все `profiles.user_id` компании AIGuild (151 чел.).
- **40 direct-диалогов**: случайные пары. Название = null. `created_by` = один из участников. Оба — участники `chat_participants` c ролью `member`.
- **10 group/department-диалогов**: `type='group'` (или `department`, если чат привязан к отделу). Название вида «Отдел «Продажи розницы»», участники — 6-12 случайных из компании, включая руководителя отдела как `admin`.
- **~1500 сообщений всего**: `msg_per_conv=30 ±10` на каждый диалог. Отправитель — случайный из участников диалога.
- Тексты — пул из 40-50 реалистичных фраз («Привет, посмотрел презентацию…», «Есть 15 минут созвониться?», «Скинь регламент, плз», «Готово, коммитнул», «Спасибо!» и т.п.) + иногда эмодзи-концовки.
- Временные метки — распределены за последние 30 дней, `created_at`/`updated_at` = равномерно. У последнего сообщения — обновляется `chat_conversations.last_message_at`.
- 20% участников имеют `last_read_at` = чуть раньше последнего сообщения (появятся непрочитанные бейджи).
- ~10% сообщений получают 1-2 записи в `chat_message_reactions` (эмодзи 👍 🔥 ❤️ 😄).
- Маркер: у всех создаваемых `chat_conversations.title` (для групп) или `chat_messages.body` первого системного сообщения содержит `[chats150]` — для `--reset`. Для direct-диалогов, где title=null, помечаем через первое сообщение с префиксом `[chats150]`.

### 2. Комментарии к задачам трекера (`tracker_comments`)

- Беру задачи компании, у которых `description LIKE '%[tracker150]%'` (те, что залил `tracker:seed-tasks`).
- 30% из них получают 1-3 коммента.
- `author_id` — либо `assignee_id`, либо `author_id` задачи (50/50).
- Тексты — пул технических комментов на русском («Начал», «Уточнил у клиента, ждём фидбек», «Заблокировано зависимостью от X», «Готово к ревью», «Смёржил», «Переношу в следующий спринт» и т.п.).
- `mentions` — 20% комментов получают одну @-упоминалку из участников компании: `[{"user_id": "...", "name": "..."}]`.
- `created_at` — между `tracker_tasks.created_at` и now(), возрастающая последовательность внутри одной задачи.
- Маркер: `body` начинается с `[chats150] ` — чтобы `--reset` мог их удалить.

### 3. Idempotency / reset

Флаг `--reset` удаляет всё, что этой командой засеяно:

1. Найти `chat_messages.id` с `body LIKE '%[chats150]%'` → удалить их + `chat_message_reactions` для них.
2. Найти `chat_conversations` где `title LIKE '%[chats150]%'` **или** во которых были помеченные сообщения → удалить `chat_participants` + `chat_messages` этих диалогов и сам диалог.
3. Удалить `tracker_comments` где `body LIKE '[chats150]%'`.

Реальные диалоги/комментарии компании не трогаются.

### 4. Порядок деплоя

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
git pull
php artisan chats:seed --owner-email=growthpeak@yandex.ru --dry-run
php artisan chats:seed --owner-email=growthpeak@yandex.ru
```

Ожидание: `Диалоги: 50, сообщения: ~1500, коммент. к задачам: ~600`.

### Технические заметки

- Всё в одной `DB::transaction`. Вставки батчами по 200 (`chat_messages`, `tracker_comments`).
- `Schema::hasColumn` защиты для необязательных полей (`last_message_at`, `mentions`).
- Не создаю никаких новых миграций — таблицы `chat_*` и `tracker_comments` уже разложены миграциями 0008 и 0020.
- Реалтайм подписки уже настроены в приложении — новые сообщения появятся, когда пользователь зайдёт в чат.

После апрува — реализую и жду вывод `php artisan chats:seed`.
