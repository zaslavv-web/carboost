<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EmployeeInvitation extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'employee_invitations';
    protected $fillable = [
        'company_id', 'invited_by', 'email', 'full_name', 'department',
        'position_id', 'requested_role', 'status', 'token', 'token_hash',
        'claimed_user_id', 'claimed_at',
    ];
    protected $casts = ['claimed_at' => 'datetime'];
    protected $hidden = ['token', 'token_hash'];
}
