<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EmployeeRiskScore extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'employee_risk_scores';
    protected $fillable = [
        'user_id', 'company_id', 'attrition_risk', 'burnout_risk',
        'engagement_score', 'risk_level', 'factors', 'recommendations',
    ];
    protected $casts = [
        'attrition_risk' => 'integer',
        'burnout_risk' => 'integer',
        'engagement_score' => 'integer',
        'factors' => 'array',
        'recommendations' => 'array',
        'computed_at' => 'datetime',
    ];
}
