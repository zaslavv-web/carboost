<?php

namespace App\Http\Controllers\Api;

use App\Models\CareerTrackTemplate;

class CareerTrackTemplateController extends CrudController
{
    protected string $modelClass = CareerTrackTemplate::class;
    protected array $with = ['actions'];
    protected array $rules = [
        'title'             => 'required|string|max:255',
        'description'       => 'nullable|string',
        'motivation_text'   => 'nullable|string',
        'estimated_months'  => 'nullable|integer|min:0',
        'steps'             => 'nullable|array',
        'is_active'         => 'nullable|boolean',
        'from_position_id'  => 'nullable|uuid|exists:positions,id',
        'to_position_id'    => 'nullable|uuid|exists:positions,id',
    ];
}
