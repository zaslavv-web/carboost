<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ProbationPeriod extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'probation_periods';
    protected $fillable = [
        'user_id', 'company_id', 'manager_id', 'hr_id',
        'start_date', 'end_date', 'extended_to',
        'status', 'decision_at', 'decision_by', 'decision_notes', 'goals',
    ];
    protected $casts = [
        'start_date'   => 'date',
        'end_date'     => 'date',
        'extended_to'  => 'date',
        'decision_at'  => 'datetime',
    ];

    public function criteria()
    {
        return $this->hasMany(ProbationCriterion::class, 'probation_id');
    }
}
