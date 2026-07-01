<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class OnboardingPlanStep extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'onboarding_plan_steps';
    protected $fillable = [
        'company_id', 'plan_id', 'title', 'description',
        'step_type', 'responsible', 'stage', 'order_index',
        'due_offset_days', 'course_id', 'material_url',
        'meeting_agenda', 'is_required',
    ];
    protected $casts = [
        'is_required'     => 'boolean',
        'order_index'     => 'integer',
        'due_offset_days' => 'integer',
    ];

    public function plan()
    {
        return $this->belongsTo(OnboardingPlan::class, 'plan_id');
    }
}
