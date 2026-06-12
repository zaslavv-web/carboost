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
        // Суперадмин и техподдержка пишут в любое время и кому угодно.
        if (method_exists($user, 'hasRole') && $user->hasRole('superadmin')) {
            return true;
        }
        $isSupport = (bool) \DB::table('profiles')->where('user_id', $user->id)->value('is_support');
        if ($isSupport) {
            return true;
        }
        // TODO: загрузить и применить chat_permissions для company_id
        return true;
    }

    public function canCreateConversation(User $user, array $participantUserIds): bool
    {
        return true;
    }
}

