<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerOkrPeriod extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'tracker_okr_periods';
    protected $fillable = [
        'company_id', 'name', 'kind', 'starts_at', 'ends_at', 'is_active',
    ];
    protected $casts = [
        'starts_at' => 'date',
        'ends_at' => 'date',
        'is_active' => 'boolean',
    ];
}
