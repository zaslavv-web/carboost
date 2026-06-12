<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class LeaveType extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'leave_types';
    protected $fillable = [
        'company_id', 'code', 'title', 'paid',
        'accrual_days_per_year', 'requires_medical_cert', 'is_active',
    ];
    protected $casts = [
        'paid' => 'boolean',
        'requires_medical_cert' => 'boolean',
        'is_active' => 'boolean',
        'accrual_days_per_year' => 'decimal:2',
    ];
}
