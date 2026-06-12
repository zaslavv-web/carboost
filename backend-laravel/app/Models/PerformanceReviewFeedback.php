<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PerformanceReviewFeedback extends Model
{
    use HasUuids;

    protected $table = 'performance_review_feedback';
    protected $fillable = [
        'review_id', 'reviewer_id', 'role',
        'competency_scores', 'overall_score',
        'strengths', 'improvements', 'comments', 'submitted_at',
    ];
    protected $casts = [
        'competency_scores' => 'array',
        'overall_score'     => 'decimal:2',
        'submitted_at'      => 'datetime',
    ];
}
