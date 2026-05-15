<?php

namespace App\Http\Controllers\Api;

use App\Models\Department;

class DepartmentController extends CrudController
{
    protected string $modelClass = Department::class;
    protected array $with = ['parent'];
    protected array $rules = [
        'name'         => 'required|string|max:255',
        'description'  => 'nullable|string',
        'parent_id'    => 'nullable|uuid|exists:departments,id',
        'head_user_id' => 'nullable|uuid',
    ];
}
