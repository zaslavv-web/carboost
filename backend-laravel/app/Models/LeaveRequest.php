<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class LeaveRequest extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'leave_requests';
    protected $fillable = [
        'user_id', 'company_id', 'leave_type_id',
        'start_date', 'end_date', 'days_count', 'reason', 'status',
        'manager_id', 'manager_decision_at', 'manager_comment',
        'hr_id', 'hr_decision_at', 'hr_comment',
        'substitute_user_id', 'paid_days', 'unpaid_days',
    ];
    protected $casts = [
        'start_date' => 'date',
        'end_date'   => 'date',
        'days_count' => 'decimal:2',
        'paid_days'  => 'decimal:2',
        'unpaid_days' => 'decimal:2',
        'manager_decision_at' => 'datetime',
        'hr_decision_at'      => 'datetime',
    ];

    public function leaveType()
    {
        return $this->belongsTo(LeaveType::class, 'leave_type_id');
    }

    public function files()
    {
        return $this->hasMany(LeaveRequestFile::class, 'request_id');
    }
}
