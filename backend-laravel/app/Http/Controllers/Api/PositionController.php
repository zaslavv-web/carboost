<?php

namespace App\Http\Controllers\Api;

use App\Models\Position;
use Illuminate\Http\Request;

/**
 * CRUD-контроллер должностей.
 *
 * FIX (HRD sim 2026-07-05): раньше правила валидации ссылались на несуществующие
 * колонки (department_id, level, parent_position_id) — попытка создания падала
 * с 500 из-за unknown column. Приведено к фактической схеме `positions`.
 */
class PositionController extends CrudController
{
    protected string $modelClass = Position::class;
    protected array $rules = [
        'title'                 => 'required|string|max:255',
        'description'           => 'nullable|string',
        'department'            => 'nullable|string|max:255',
        'competency_profile'    => 'nullable|array',
        'psychological_profile' => 'nullable',
        'profile_status'        => 'nullable|string|in:draft,ready,approved',
        'profile_template'      => 'nullable|array',
    ];

    protected function applyFilters($query, Request $request): void
    {
        if ($department = $request->get('department')) {
            $query->where('department', $department);
        }
        if ($status = $request->get('profile_status')) {
            $query->where('profile_status', $status);
        }
    }
}
