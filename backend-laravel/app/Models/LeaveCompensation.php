<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class LeaveCompensation extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'leave_compensations';
    protected $fillable = [
        'user_id', 'company_id', 'unused_days', 'daily_rate',
        'total_amount', 'currency', 'calculated_at', 'paid_at',
        'calculated_by', 'notes',
    ];
    protected $casts = [
        'unused_days'   => 'decimal:2',
        'daily_rate'    => 'decimal:2',
        'total_amount'  => 'decimal:2',
        'calculated_at' => 'datetime',
        'paid_at'       => 'datetime',
    ];
}
