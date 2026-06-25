<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerComment extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'tracker_comments';
    protected $fillable = [
        'company_id', 'task_id', 'author_id',
        'body', 'mentions', 'edited_at',
    ];
    protected $casts = [
        'mentions'  => 'array',
        'edited_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->author_id) && $u = auth()->user()) {
                $m->author_id = $u->id;
            }
            if (empty($m->company_id) && !empty($m->task_id)) {
                $cid = TrackerTask::query()->withoutGlobalScopes()
                    ->where('id', $m->task_id)->value('company_id');
                if ($cid) $m->company_id = $cid;
            }
        });

        static::created(function (self $m) {
            TrackerAuditLog::create([
                'company_id'  => $m->company_id,
                'entity_type' => 'task',
                'entity_id'   => $m->task_id,
                'action'      => 'comment_added',
                'actor_id'    => auth()->id() ?? $m->author_id,
                'payload'     => [
                    'comment_id' => $m->id,
                    'preview'    => mb_substr((string) $m->body, 0, 160),
                    'mentions'   => $m->mentions ?? [],
                ],
            ]);
        });

        static::updated(function (self $m) {
            if ($m->wasChanged('body')) {
                $m->edited_at = now();
                $m->saveQuietly();
            }
        });
    }

    public function task() { return $this->belongsTo(TrackerTask::class, 'task_id'); }
}
