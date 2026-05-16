<?php

namespace App\Http\Controllers\Api;

use App\Models\TeamMember;
use Illuminate\Http\Request;

class TeamMemberController extends CrudController
{
    protected string $modelClass = TeamMember::class;
    protected array $with = ['manager', 'employee'];
    protected array $rules = [
        'manager_id'  => 'required|uuid',
        'employee_id' => 'required|uuid',
    ];

    protected function applyFilters($query, Request $request): void
    {
        if ($managerId = $request->get('manager_id')) {
            $query->where('manager_id', $managerId);
        }
    }
}
