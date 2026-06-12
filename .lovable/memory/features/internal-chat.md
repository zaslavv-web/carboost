---
name: Internal Chats
description: In-app messaging between employees of same company (1:1 MVP, schema ready for groups/permissions)
type: feature
---
Внутренние чаты компании (MVP).

**Backend (Laravel):**
- Таблицы: `chat_conversations` (type: direct|group|department), `chat_participants` (last_read_at для unread), `chat_messages` (body, reply_to_id, soft delete), `chat_message_reactions` (emoji), `chat_permissions` (заготовка под расписания/whitelist/blacklist — пустая)
- `ChatController` под `/api/chats/*`: index, store (direct идемпотентно), contacts, messages, send, markRead, toggleReaction, unreadCount
- `ChatPermissionService::canSend()` — точка расширения, MVP всегда true
- Broadcast: `ChatMessageSent` → private `chat.conversation.{id}` (channels.php), регистрация в bootstrap/app.php через `channels:`
- Все таблицы scoped по company_id (BelongsToCompany trait + CompanyScope)

**Frontend:**
- `ChatProvider` (src/contexts/ChatContext.tsx) — глобальный state, polling /chats каждые 7s, unread total
- `ChatLauncher` — плавающая кнопка bottom-right с бейджем непрочитанных, скрыта на /, /login, /reset-password, /pricing, /chats и при impersonation
- `ChatPanel` — выезжающая 380×560 панель: список диалогов ↔ переписка
- `/chats` и `/chats/:conversationId` — полноэкранный режим (src/pages/Chats.tsx)
- Polling сообщений каждые 5s в активном диалоге (Reverb опционален)
- Reply + emoji-реакции, mark-read при открытии
- Пункт сайдбара «Сообщения» (nav.chats) для всех ролей кроме superadmin

**Что НЕ входит в MVP:** групповые чаты UI (схема готова), вложения, push, поиск по истории, редактирование сообщений, админка прав, real Reverb wiring на фронте (используется polling).
