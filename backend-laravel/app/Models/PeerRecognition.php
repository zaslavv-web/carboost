<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PeerRecognition extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'peer_recognitions';
    protected $fillable = [
        'company_id', 'from_user_id', 'to_user_id',
        'category', 'message', 'coin_reward',
    ];
    protected $casts = [
        'coin_reward' => 'integer',
    ];
}
