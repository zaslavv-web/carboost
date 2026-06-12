<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ChatMessageReaction extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $table = 'chat_message_reactions';
    protected $fillable = ['message_id', 'user_id', 'emoji'];
    protected $casts = ['created_at' => 'datetime'];
}
