<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class LeaveBalance extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'leave_balances';
    protected $fillable = [
        'user_id', 'company_id', 'leave_type_id',
        'accrued_days', 'used_days', 'carryover_days', 'as_of',
    ];
    protected $casts = [
        'accrued_days' => 'decimal:2',
        'used_days' => 'decimal:2',
        'carryover_days' => 'decimal:2',
        'as_of' => 'date',
    ];

    public function leaveType()
    {
        return $this->belongsTo(LeaveType::class, 'leave_type_id');
    }
}
