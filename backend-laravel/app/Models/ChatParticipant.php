<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ChatParticipant extends Model
{
    use HasUuids;

    protected $table = 'chat_participants';
    protected $fillable = ['conversation_id', 'user_id', 'role', 'joined_at', 'last_read_at', 'muted_until'];
    protected $casts = [
        'joined_at'    => 'datetime',
        'last_read_at' => 'datetime',
        'muted_until'  => 'datetime',
    ];

    public function conversation()
    {
        return $this->belongsTo(ChatConversation::class, 'conversation_id');
    }
}
