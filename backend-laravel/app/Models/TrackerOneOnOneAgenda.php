<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerOneOnOneAgenda extends Model
{
    use HasUuids;

    protected $table = 'tracker_one_on_one_agenda';
    protected $fillable = [
        'meeting_id', 'title', 'notes', 'position',
        'linked_task_id', 'linked_goal_id', 'is_done',
    ];
    protected $casts = [
        'is_done' => 'boolean',
        'position' => 'integer',
    ];
}
