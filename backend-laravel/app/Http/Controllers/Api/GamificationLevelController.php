<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GamificationLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * CRUD для уровней геймификации компании.
 * Видимость — в пределах company_id текущего пользователя (superadmin — все).
 * Запись — HRD / company_admin / superadmin.
 */
class GamificationLevelController extends Controller
{
    private function companyScope(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) return null;
        // superadmin может явно фильтровать
        if ($user->hasRole('superadmin') && $request->filled('company_id')) {
            return (string) $request->get('company_id');
        }
        return $user->company_id ?? null;
    }

    private function ensureCanWrite(Request $request): void
    {
        $user = $request->user();
        abort_unless(
            $user && ($user->hasRole('superadmin') || $user->hasRole('hrd') || $user->hasRole('company_admin')),
            403,
            'Нет прав на изменение уровней геймификации'
        );
    }

    public function index(Request $request): JsonResponse
    {
        $companyId = $this->companyScope($request);
        $q = GamificationLevel::query()->orderBy('order');
        if ($companyId) $q->where('company_id', $companyId);
        return response()->json($q->get());
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureCanWrite($request);
        $data = $request->validate([
            'company_id'        => 'nullable|uuid',
            'order'             => 'required|integer|min:1',
            'title'             => 'required|string|max:120',
            'icon'              => 'nullable|string|max:64',
            'color'             => 'nullable|string|max:32',
            'min_points'        => 'nullable|integer|min:0',
            'min_tenure_months' => 'nullable|integer|min:0',
            'min_achievements'  => 'nullable|integer|min:0',
            'description'       => 'nullable|string',
        ]);
        $data['company_id'] = $data['company_id'] ?? $request->user()->company_id;
        $data['id'] = (string) Str::uuid();
        $level = GamificationLevel::create($data);
        return response()->json($level, 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->ensureCanWrite($request);
        $level = GamificationLevel::findOrFail($id);
        $data = $request->validate([
            'order'             => 'sometimes|integer|min:1',
            'title'             => 'sometimes|string|max:120',
            'icon'              => 'sometimes|nullable|string|max:64',
            'color'             => 'sometimes|nullable|string|max:32',
            'min_points'        => 'sometimes|integer|min:0',
            'min_tenure_months' => 'sometimes|integer|min:0',
            'min_achievements'  => 'sometimes|integer|min:0',
            'description'       => 'sometimes|nullable|string',
        ]);
        $level->update($data);
        return response()->json($level->fresh());
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->ensureCanWrite($request);
        $level = GamificationLevel::findOrFail($id);
        $level->delete();
        return response()->json(['ok' => true]);
    }
}
