<?php

namespace App\Http\Controllers\Api;

use App\Models\LeaveType;
use Illuminate\Http\Request;

class LeaveTypeController extends CrudController
{
    protected string $modelClass = LeaveType::class;
    protected array $rules = [
        'code'                  => 'required|string|max:64',
        'title'                 => 'required|string|max:200',
        'paid'                  => 'sometimes|boolean',
        'accrual_days_per_year' => 'sometimes|numeric|min:0',
        'requires_medical_cert' => 'sometimes|boolean',
        'is_active'             => 'sometimes|boolean',
    ];

    protected function applyFilters($query, Request $request): void
    {
        if ($request->boolean('only_active')) $query->where('is_active', true);
    }
}
