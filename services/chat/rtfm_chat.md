# rtfm_chat — Внутренний мессенджер

> Статус: **каркас (stage 1)**. Код — в `backend-laravel/app/Http/Controllers/Api/ChatController.php`, `backend-laravel/app/Events/ChatMessageSent.php`, `backend-laravel/app/Services/ChatPermissionService.php`, `backend-laravel/routes/channels.php`.

## 1. Назначение
1:1 и групповые чаты сотрудников внутри одной компании. Реалтайм через Laravel Reverb (WebSocket). Права доступа определяются политиками мультитенантности (`company_id`) и `ChatPermissionService`.

## 2. Переменные окружения

| KEY | Обязат. | Описание | Пример | Где |
|---|---|---|---|---|
| `BROADCAST_CONNECTION` | да | Драйвер бродкаста | `reverb` | `config/broadcasting.php` |
| `REVERB_APP_ID` | да | ID приложения | `growthpeak` | Reverb server |
| `REVERB_APP_KEY` | да | Публичный ключ (уезжает во фронт как `VITE_REVERB_KEY`) | `pk_...` | Reverb + SPA |
| `REVERB_APP_SECRET` | да | Секрет для сервера | `sk_...` | Reverb server |
| `REVERB_HOST` | да | Bind host | `0.0.0.0` | Reverb server |
| `REVERB_PORT` | да | Порт | `8080` | Reverb server |
| `REVERB_SCHEME` | да | http/https | `https` | Reverb server |

## 3. Инфопотоки

```text
SPA ──REST /api/chat/*──► ChatController ──► ChatMessage (PG)
                              │
                              └─► event ChatMessageSent ──► Reverb ──WS──► SPA (все участники)
```

## 4. Связь с ядром
- Использует таблицы `chat_conversations`, `chat_participants`, `chat_messages`, `chat_message_reactions`, `users`, `companies`.
- Читает `user_roles` через `has_role()` (security definer).
- Канал приватности регистрируется в `routes/channels.php`.

## 5. Публичные эндпоинты
| Метод | Путь | Описание |
|---|---|---|
| GET  | `/api/chat/conversations` | Список бесед пользователя |
| POST | `/api/chat/conversations` | Создать 1:1 |
| GET  | `/api/chat/conversations/{id}/messages` | История |
| POST | `/api/chat/conversations/{id}/messages` | Отправить сообщение |
| POST | `/api/chat/messages/{id}/reactions` | Реакция |
| GET  | `/api/chat/contacts` | Поиск контактов внутри компании |
| WS   | `private-chat.conversation.{id}` | Реалтайм |

## 6. Запуск локально
```bash
php artisan reverb:start --host=0.0.0.0 --port=8080
```

## 7. Тесты
Покрытие — `core/tests/Feature/` (интеграционные).
