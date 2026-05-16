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
        'questions'         => 'nullable|array',
        'is_active'         => 'nullable|boolean',
        'source_file_url'   => 'nullable|string',
        'source_file_name'  => 'nullable|string|max:255',
    ];
}
