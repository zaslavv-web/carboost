<?php

namespace App\Http\Controllers\Api;

use App\Models\LeaveBalance;
use Illuminate\Http\Request;

class LeaveBalanceController extends CrudController
{
    protected string $modelClass = LeaveBalance::class;
    protected array $with = ['leaveType'];
    protected array $rules = [
        'user_id'        => 'required|uuid',
        'leave_type_id'  => 'required|uuid',
        'accrued_days'   => 'sometimes|numeric|min:0',
        'used_days'      => 'sometimes|numeric|min:0',
        'carryover_days' => 'sometimes|numeric|min:0',
        'as_of'          => 'sometimes|date',
    ];

    protected function applyFilters($query, Request $request): void
    {
        $user = $request->user();
        // Сотрудник видит только свои; HRD/admin — компанию (CompanyScope уже фильтрует).
        if (!$user || (!$user->hasRole('hrd') && !$user->hasRole('company_admin') && !$user->hasRole('superadmin'))) {
            $query->where('user_id', $user?->getAuthIdentifier());
        }
        if ($uid = $request->get('user_id')) {
            $query->where('user_id', $uid);
        }
    }
}
