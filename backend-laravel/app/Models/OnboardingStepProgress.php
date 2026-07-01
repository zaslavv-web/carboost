<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class OnboardingStepProgress extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'onboarding_step_progress';
    protected $fillable = [
        'company_id', 'assignment_id', 'step_id',
        'status', 'completed_at', 'completed_by',
        'comment', 'attachment_url',
    ];
    protected $casts = [
        'completed_at' => 'datetime',
    ];

    public function assignment()
    {
        return $this->belongsTo(OnboardingAssignment::class, 'assignment_id');
    }

    public function step()
    {
        return $this->belongsTo(OnboardingPlanStep::class, 'step_id');
    }
}
