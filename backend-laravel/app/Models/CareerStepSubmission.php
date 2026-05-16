<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class CareerStepSubmission extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'career_step_submissions';
    protected $fillable = [
        'assignment_id', 'template_id', 'step_order', 'user_id', 'company_id',
        'status', 'comment', 'is_reinforced', 'attempt_no',
        'reviewed_by', 'reviewed_at', 'rejection_reason', 'test_attempt_id',
    ];
    protected $casts = [
        'is_reinforced' => 'boolean',
        'attempt_no' => 'integer',
        'step_order' => 'integer',
        'reviewed_at' => 'datetime',
    ];

    public function files()
    {
        return $this->hasMany(CareerStepSubmissionFile::class, 'submission_id');
    }
}
