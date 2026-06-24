<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerTaskCheckin extends Model
{
    use HasUuids;

    protected $table = 'tracker_task_checkins';
    protected $fillable = ['task_id', 'author_id', 'note', 'status_to'];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->author_id) && $u = auth()->user()) {
                $m->author_id = $u->id;
            }
        });
    }
}
