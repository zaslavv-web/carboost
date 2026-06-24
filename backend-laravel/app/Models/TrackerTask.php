<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerTask extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'tracker_tasks';
    protected $fillable = [
        'company_id', 'author_id', 'assignee_id', 'parent_task_id',
        'title', 'description', 'status', 'urgency', 'due_at',
        'jira_key', 'completed_at', 'last_notified_at',
    ];
    protected $casts = [
        'due_at' => 'datetime',
        'completed_at' => 'datetime',
        'last_notified_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->author_id) && $u = auth()->user()) {
                $m->author_id = $u->id;
            }
        });
        static::updated(function (self $m) {
            if ($m->wasChanged('status')) {
                TrackerAuditLog::create([
                    'company_id' => $m->company_id,
                    'entity_type' => 'task',
                    'entity_id' => $m->id,
                    'action' => 'status_change',
                    'status_from' => $m->getOriginal('status'),
                    'status_to' => $m->status,
                    'actor_id' => auth()->id(),
                ]);
                if ($m->status === 'done' && empty($m->completed_at)) {
                    $m->completed_at = now();
                    $m->saveQuietly();
                }
            }
        });
    }

    public function links()
    {
        return $this->hasMany(TrackerTaskGoalLink::class, 'task_id');
    }
}
