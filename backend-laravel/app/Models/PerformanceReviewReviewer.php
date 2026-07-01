<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PerformanceReviewReviewer extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'performance_review_reviewers';
    protected $fillable = [
        'company_id', 'review_id', 'reviewer_id', 'role', 'status',
        'invited_by', 'invited_at', 'submitted_at', 'decline_reason',
    ];
    protected $casts = [
        'invited_at'   => 'datetime',
        'submitted_at' => 'datetime',
    ];

    public function review()
    {
        return $this->belongsTo(PerformanceReview::class, 'review_id');
    }
}
