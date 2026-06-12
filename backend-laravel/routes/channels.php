<?php

use App\Models\ChatParticipant;
use Illuminate\Support\Facades\Broadcast;

/**
 * Авторизация приватных Reverb-каналов.
 *
 * chat.conversation.{id} — допускаются только участники этого диалога.
 * chat.user.{userId}     — пользователь подписывается только на свой канал.
 */
Broadcast::channel('chat.conversation.{conversationId}', function ($user, $conversationId) {
    return ChatParticipant::where('conversation_id', $conversationId)
        ->where('user_id', $user->id)
        ->exists();
});

Broadcast::channel('chat.user.{userId}', function ($user, $userId) {
    return (string) $user->id === (string) $userId;
});
