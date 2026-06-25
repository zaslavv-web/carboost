<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerSprint extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'tracker_sprints';
    protected $fillable = [
        'company_id', 'project_id', 'name', 'goal',
        'status', 'start_date', 'end_date', 'completed_at', 'position',
    ];
    protected $casts = [
        'start_date'   => 'datetime',
        'end_date'     => 'datetime',
        'completed_at' => 'datetime',
        'position'     => 'integer',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->company_id) && !empty($m->project_id)) {
                $cid = TrackerProject::query()->withoutGlobalScopes()
                    ->where('id', $m->project_id)->value('company_id');
                if ($cid) $m->company_id = $cid;
            }
        });
    }

    public function project()
    {
        return $this->belongsTo(TrackerProject::class, 'project_id');
    }

    public function tasks()
    {
        return $this->hasMany(TrackerTask::class, 'sprint_id');
    }
}
