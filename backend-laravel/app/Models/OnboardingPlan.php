<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class OnboardingPlan extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'onboarding_plans';
    protected $fillable = [
        'company_id', 'created_by', 'title', 'description',
        'position_id', 'department_id', 'grade', 'target_role',
        'duration_days', 'is_active', 'auto_assign',
    ];
    protected $casts = [
        'is_active'     => 'boolean',
        'auto_assign'   => 'boolean',
        'duration_days' => 'integer',
    ];

    public function steps()
    {
        return $this->hasMany(OnboardingPlanStep::class, 'plan_id')->orderBy('order_index');
    }

    public function assignments()
    {
        return $this->hasMany(OnboardingAssignment::class, 'plan_id');
    }
}
