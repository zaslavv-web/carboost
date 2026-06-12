<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PerformanceReview extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'performance_reviews';
    protected $fillable = [
        'cycle_id', 'user_id', 'company_id', 'manager_id', 'status',
        'self_score', 'manager_score', 'peer_score', 'final_score',
        'summary', 'finalized_at',
    ];
    protected $casts = [
        'self_score'    => 'decimal:2',
        'manager_score' => 'decimal:2',
        'peer_score'    => 'decimal:2',
        'final_score'   => 'decimal:2',
        'finalized_at'  => 'datetime',
    ];

    public function cycle()    { return $this->belongsTo(PerformanceCycle::class, 'cycle_id'); }
    public function feedback() { return $this->hasMany(PerformanceReviewFeedback::class, 'review_id'); }
}
