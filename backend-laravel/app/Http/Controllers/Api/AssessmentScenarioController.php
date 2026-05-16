<?php

namespace App\Http\Controllers\Api;

use App\Models\AssessmentScenario;

class AssessmentScenarioController extends CrudController
{
    protected string $modelClass = AssessmentScenario::class;
    protected array $rules = [
        'title'         => 'required|string|max:255',
        'description'   => 'nullable|string',
        'file_url'      => 'nullable|string',
        'scenario_data' => 'nullable|array',
        'is_active'     => 'nullable|boolean',
    ];
}
