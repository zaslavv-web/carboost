<?php

namespace App\Http\Controllers\Api;

use App\Models\ClosedQuestionTest;

class ClosedQuestionTestController extends CrudController
{
    protected string $modelClass = ClosedQuestionTest::class;
    protected array $rules = [
        'title'             => 'required|string|max:255',
        'description'       => 'nullable|string',
        'position_id'       => 'nullable|uuid|exists:positions,id',
        'audience_rules'    => 'nullable|array',
        'audience_rules.user_ids' => 'nullable|array',
        'audience_rules.departments' => 'nullable|array',
        'audience_rules.position_ids' => 'nullable|array',
        'questions'         => 'nullable|array',
        'is_active'         => 'nullable|boolean',
        'assigned_at'       => 'nullable|date',
        'source_file_url'   => 'nullable|string',
        'source_file_name'  => 'nullable|string|max:255',
    ];
}
