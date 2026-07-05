<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * hr_task_assignees — join таблица без company_id (BelongsToCompany не используется).
 * Скоуп идёт через задачу (hr_tasks.company_id).
 */
class HrTaskAssignee extends Model
{
    use HasUuids;

    protected $table = 'hr_task_assignees';
    protected $fillable = ['task_id', 'user_id', 'individual_status', 'reward_paid'];
    protected $casts = ['reward_paid' => 'boolean'];

    public function task()
    {
        return $this->belongsTo(HrTask::class, 'task_id');
    }
}
