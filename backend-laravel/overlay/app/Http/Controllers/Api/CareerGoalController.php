<?php

namespace App\Http\Controllers\Api;

use App\Models\CareerGoal;
use Illuminate\Http\Request;

class CareerGoalController extends CrudController
{
    protected string $modelClass = CareerGoal::class;
    protected array $with = ['checklistItems'];
    protected array $rules = [
        'user_id'        => 'required|uuid',
        'assignment_id'  => 'nullable|uuid',
        'title'          => 'required|string|max:255',
        'description'    => 'nullable|string',
        'status'         => 'nullable|string|max:32',
        'progress'       => 'nullable|integer|min:0|max:100',
        'deadline'       => 'nullable|date',
        'step_order'     => 'nullable|integer',
        'auto_generated' => 'nullable|boolean',
    ];

    protected function applyFilters($query, Request $request): void
    {
        $userId = $request->get('user_id', auth()->id());
        $query->where('user_id', $userId);
        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }
    }
}
