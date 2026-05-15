<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class GamificationRewardType extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'gamification_reward_types';
    protected $fillable = [
        'company_id', 'created_by', 'title', 'description', 'icon',
        'category', 'reward_kind', 'points', 'is_active', 'image_url',
        'trigger_mode', 'trigger_events', 'gift_content',
        'non_monetary_title', 'non_monetary_description',
        'monetary_amount', 'monetary_currency',
    ];
    protected $casts = [
        'is_active' => 'boolean',
        'points' => 'integer',
        'trigger_events' => 'array',
        'monetary_amount' => 'decimal:2',
    ];
}
