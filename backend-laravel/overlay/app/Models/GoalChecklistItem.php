<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Чек-лист пункта цели. Авторизация — через родительскую career_goals.user_id.
 * Поэтому свой policy не используется (см. CareerGoalPolicy::manageChecklist).
 */
class GoalChecklistItem extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'goal_checklist_items';
    public $timestamps = false;
    protected $fillable = ['goal_id', 'company_id', 'text', 'is_done', 'deadline'];
    protected $casts = ['is_done' => 'boolean', 'deadline' => 'date', 'created_at' => 'datetime'];

    public function goal()
    {
        return $this->belongsTo(CareerGoal::class, 'goal_id');
    }
}
