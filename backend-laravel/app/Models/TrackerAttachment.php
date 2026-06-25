<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerAttachment extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'tracker_attachments';
    protected $fillable = [
        'company_id', 'task_id', 'comment_id', 'uploader_id',
        'filename', 'mime', 'size_bytes', 'storage_path',
    ];
    protected $casts = [
        'size_bytes' => 'integer',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->uploader_id) && $u = auth()->user()) {
                $m->uploader_id = $u->id;
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
                'action'      => 'attachment_added',
                'actor_id'    => auth()->id() ?? $m->uploader_id,
                'payload'     => [
                    'attachment_id' => $m->id,
                    'filename'      => $m->filename,
                    'size_bytes'    => $m->size_bytes,
                ],
            ]);
        });

        static::deleted(function (self $m) {
            TrackerAuditLog::create([
                'company_id'  => $m->company_id,
                'entity_type' => 'task',
                'entity_id'   => $m->task_id,
                'action'      => 'attachment_deleted',
                'actor_id'    => auth()->id() ?? $m->uploader_id,
                'payload'     => [
                    'attachment_id' => $m->id,
                    'filename'      => $m->filename,
                ],
            ]);
        });
    }

    public function task() { return $this->belongsTo(TrackerTask::class, 'task_id'); }
}
