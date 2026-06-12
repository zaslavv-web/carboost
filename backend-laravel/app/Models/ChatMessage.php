<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ChatMessage extends Model
{
    use HasUuids;

    protected $table = 'chat_messages';
    protected $fillable = ['conversation_id', 'sender_id', 'body', 'reply_to_id', 'edited_at', 'deleted_at'];
    protected $casts = [
        'edited_at'  => 'datetime',
        'deleted_at' => 'datetime',
    ];

    public function reactions()
    {
        return $this->hasMany(ChatMessageReaction::class, 'message_id');
    }

    public function conversation()
    {
        return $this->belongsTo(ChatConversation::class, 'conversation_id');
    }

    public function replyTo()
    {
        return $this->belongsTo(ChatMessage::class, 'reply_to_id');
    }
}
