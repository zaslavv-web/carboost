<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ChatConversation extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'chat_conversations';
    protected $fillable = ['company_id', 'type', 'title', 'created_by', 'last_message_at'];
    protected $casts = ['last_message_at' => 'datetime'];

    public function participants()
    {
        return $this->hasMany(ChatParticipant::class, 'conversation_id');
    }

    public function messages()
    {
        return $this->hasMany(ChatMessage::class, 'conversation_id');
    }
}
