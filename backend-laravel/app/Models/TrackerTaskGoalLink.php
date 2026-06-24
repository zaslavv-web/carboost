<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerTaskGoalLink extends Model
{
    use HasUuids;

    protected $table = 'tracker_task_goal_links';
    protected $fillable = [
        'task_id', 'goal_id', 'key_result_id', 'impact_weight', 'created_by',
    ];
    protected $casts = ['impact_weight' => 'float'];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->created_by) && $u = auth()->user()) {
                $m->created_by = $u->id;
            }
        });
    }

    public function task()
    {
        return $this->belongsTo(TrackerTask::class, 'task_id');
    }
    public function goal()
    {
        return $this->belongsTo(TrackerGoal::class, 'goal_id');
    }
}
