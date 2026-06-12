<?php

namespace App\Services;

use App\Models\ChatConversation;
use App\Models\User;

/**
 * Точка расширения для тонких прав чата.
 *
 * MVP: всем участникам разрешено писать. В будущем тут добавятся:
 *   - проверка окна рабочего времени (time_window_start/end + weekdays)
 *   - whitelist/blacklist на уровне компании, отдела, роли, пользователя
 *   - запрет писать руководителям и т.п.
 *
 * Данные читаются из таблицы chat_permissions.
 */
class ChatPermissionService
{
    public function canSend(User $user, ChatConversation $conversation): bool
    {
        // TODO: загрузить и применить chat_permissions для company_id
        return true;
    }

    public function canCreateConversation(User $user, array $participantUserIds): bool
    {
        // TODO: аналогично — пока разрешено всем
        return true;
    }
}
