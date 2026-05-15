<?php

namespace App\Http\Controllers\Api;

use App\Models\PositionCareerPath;

class PositionCareerPathController extends CrudController
{
    protected string $modelClass = PositionCareerPath::class;
    protected array $rules = [
        'from_position_id' => 'required|uuid|exists:positions,id',
        'to_position_id'   => 'required|uuid|exists:positions,id',
        'description'      => 'nullable|string',
        'requirements'     => 'nullable|array',
    ];
}
