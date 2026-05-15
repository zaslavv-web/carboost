<?php

namespace App\Http\Controllers\Api;

use App\Models\Assessment;
use Illuminate\Http\Request;

class AssessmentController extends CrudController
{
    protected string $modelClass = Assessment::class;
    protected array $rules = [
        'user_id'         => 'required|uuid',
        'assessment_type' => 'required|string|max:64',
        'assessment_data' => 'nullable|array',
        'change_value'    => 'nullable|string|max:64',
        'score'           => 'nullable|integer',
    ];

    protected function applyFilters($query, Request $request): void
    {
        if ($userId = $request->get('user_id')) {
            $query->where('user_id', $userId);
        } else {
            $query->where('user_id', auth()->id());
        }
        if ($type = $request->get('assessment_type')) {
            $query->where('assessment_type', $type);
        }
    }
}
