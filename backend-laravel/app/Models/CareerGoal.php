<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class CareerGoal extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'career_goals';
    protected $fillable = [
        'user_id', 'company_id', 'assignment_id', 'title', 'description',
        'status', 'progress', 'deadline', 'step_order', 'auto_generated',
    ];
    protected $casts = [
        'deadline' => 'date',
        'progress' => 'integer',
        'step_order' => 'integer',
        'auto_generated' => 'boolean',
    ];

    public function checklistItems()
    {
        return $this->hasMany(GoalChecklistItem::class, 'goal_id');
    }
}
