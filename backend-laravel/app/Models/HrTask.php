<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class HrTask extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'hr_tasks';
    protected $fillable = [
        'company_id', 'created_by', 'title', 'description', 'category',
        'reward_coins', 'deadline', 'status', 'reviewed_by', 'reviewed_at',
    ];
    protected $casts = [
        'deadline' => 'date',
        'reviewed_at' => 'datetime',
        'reward_coins' => 'integer',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->created_by) && ($u = auth()->user())) {
                $m->created_by = $u->id;
            }
        });
    }

    public function assignees()
    {
        return $this->hasMany(HrTaskAssignee::class, 'task_id');
    }
}
