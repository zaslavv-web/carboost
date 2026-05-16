<?php

namespace App\Http\Controllers\Api;

use App\Models\Competency;
use Illuminate\Http\Request;

class CompetencyController extends CrudController
{
    protected string $modelClass = Competency::class;
    protected array $rules = [
        'user_id'     => 'required|uuid',
        'name'        => 'required|string|max:255',
        'category'    => 'nullable|string|max:64',
        'level'       => 'nullable|integer|min:0|max:100',
        'target_level'=> 'nullable|integer|min:0|max:100',
    ];

    protected function applyFilters($query, Request $request): void
    {
        $userId = $request->get('user_id', auth()->id());
        $query->where('user_id', $userId);
    }
}
