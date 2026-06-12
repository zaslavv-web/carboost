<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class OneOnOneMeeting extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'one_on_one_meetings';
    protected $fillable = [
        'manager_id', 'employee_id', 'company_id',
        'scheduled_at', 'duration_min', 'status',
        'agenda', 'notes', 'related_type', 'related_id',
    ];
    protected $casts = [
        'scheduled_at' => 'datetime',
        'duration_min' => 'integer',
    ];
}
