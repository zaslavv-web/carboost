<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerOneOnOne extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'tracker_one_on_ones';
    protected $fillable = [
        'company_id', 'manager_id', 'employee_id', 'scheduled_at',
        'duration_minutes', 'status', 'notes', 'summary',
    ];
    protected $casts = [
        'scheduled_at' => 'datetime',
        'duration_minutes' => 'integer',
    ];

    public function agenda()
    {
        return $this->hasMany(TrackerOneOnOneAgenda::class, 'meeting_id')->orderBy('position');
    }
}
