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

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->manager_id) && $u = auth()->user()) {
                $m->manager_id = $u->id;
            }
            if (empty($m->company_id)) {
                $owner = $m->manager_id ?: $m->employee_id;
                if ($owner) {
                    $cid = \App\Models\Profile::query()->withoutGlobalScopes()
                        ->where('user_id', $owner)->value('company_id');
                    if ($cid) $m->company_id = $cid;
                }
            }
        });
    }

    public function agenda()
    {
        return $this->hasMany(TrackerOneOnOneAgenda::class, 'meeting_id')->orderBy('position');
    }
}
