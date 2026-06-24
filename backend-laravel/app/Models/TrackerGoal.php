<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerGoal extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'tracker_goals';
    protected $fillable = [
        'company_id', 'period_id', 'holder_id', 'author_id', 'parent_goal_id',
        'team_id', 'title', 'description', 'status', 'progress',
        'needs_review_reason', 'published_at', 'archived_at',
    ];
    protected $casts = [
        'progress' => 'float',
        'published_at' => 'datetime',
        'archived_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->author_id) && $u = auth()->user()) {
                $m->author_id = $u->id;
            }
            if (empty($m->company_id) && !empty($m->holder_id)) {
                $cid = \App\Models\Profile::query()->withoutGlobalScopes()
                    ->where('user_id', $m->holder_id)->value('company_id');
                if ($cid) $m->company_id = $cid;
            }
        });
        static::updated(function (self $m) {
            if ($m->wasChanged('status')) {
                TrackerAuditLog::create([
                    'company_id' => $m->company_id,
                    'entity_type' => 'goal',
                    'entity_id' => $m->id,
                    'action' => 'status_change',
                    'status_from' => $m->getOriginal('status'),
                    'status_to' => $m->status,
                    'actor_id' => auth()->id(),
                ]);
            }
        });
    }

    public function keyResults()
    {
        return $this->hasMany(TrackerKeyResult::class, 'goal_id');
    }
}
