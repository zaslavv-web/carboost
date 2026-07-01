<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class OnboardingAssignment extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'onboarding_assignments';
    protected $fillable = [
        'company_id', 'user_id', 'plan_id',
        'manager_id', 'buddy_id', 'hr_id',
        'start_date', 'expected_end_date', 'actual_end_date',
        'status', 'current_stage', 'progress_percent',
        'notes', 'last_notified_at',
    ];
    protected $casts = [
        'start_date'        => 'date',
        'expected_end_date' => 'date',
        'actual_end_date'   => 'date',
        'last_notified_at'  => 'datetime',
        'progress_percent'  => 'integer',
    ];

    public function plan()
    {
        return $this->belongsTo(OnboardingPlan::class, 'plan_id');
    }

    public function progress()
    {
        return $this->hasMany(OnboardingStepProgress::class, 'assignment_id');
    }
}
