<?php

namespace App\Http\Controllers\Api;

use App\Models\Achievement;
use Illuminate\Http\Request;

class AchievementController extends CrudController
{
    protected string $modelClass = Achievement::class;
    protected array $rules = [
        'user_id'          => 'required|uuid',
        'title'            => 'required|string|max:255',
        'description'      => 'nullable|string',
        'icon'             => 'nullable|string|max:64',
        'achievement_date' => 'nullable|date',
    ];

    protected function applyFilters($query, Request $request): void
    {
        if ($userId = $request->get('user_id')) {
            $query->where('user_id', $userId);
        } else {
            // По умолчанию — свои; hrd/admin могут передать ?user_id=
            $query->where('user_id', auth()->id());
        }
    }
}
