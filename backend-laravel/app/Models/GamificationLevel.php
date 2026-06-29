<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class GamificationLevel extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'gamification_levels';

    protected $fillable = [
        'company_id', 'order', 'title', 'icon', 'color',
        'min_points', 'min_tenure_months', 'min_achievements', 'description',
    ];

    protected $casts = [
        'order'             => 'integer',
        'min_points'        => 'integer',
        'min_tenure_months' => 'integer',
        'min_achievements'  => 'integer',
    ];
}
