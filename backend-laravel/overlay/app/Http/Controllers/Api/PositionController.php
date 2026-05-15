<?php

namespace App\Http\Controllers\Api;

use App\Models\Position;
use Illuminate\Http\Request;

class PositionController extends CrudController
{
    protected string $modelClass = Position::class;
    protected array $rules = [
        'title'              => 'required|string|max:255',
        'description'        => 'nullable|string',
        'department_id'      => 'nullable|uuid|exists:departments,id',
        'level'              => 'nullable|string|max:64',
        'parent_position_id' => 'nullable|uuid|exists:positions,id',
    ];

    protected function applyFilters($query, Request $request): void
    {
        if ($departmentId = $request->get('department_id')) {
            $query->where('department_id', $departmentId);
        }
    }
}
