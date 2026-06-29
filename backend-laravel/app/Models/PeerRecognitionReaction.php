<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PeerRecognitionReaction extends Model
{
    use HasUuids;

    protected $table = 'peer_recognition_reactions';
    protected $fillable = [
        'recognition_id', 'user_id', 'reaction',
    ];
}
