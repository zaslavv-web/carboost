<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Базовый CRUD-контроллер для company-scoped моделей.
 *
 * Контракт наследников:
 *   protected string $modelClass — Eloquent-модель
 *   protected array  $rules      — validation rules для store/update
 *   protected array  $with       = [] — eager-load relations
 *
 * Авторизация делегируется политикам через $this->authorize(...).
 * Глобальный CompanyScope автоматически фильтрует по company_id.
 */
abstract class CrudController extends Controller
{
    protected string $modelClass;
    protected array $rules = [];
    protected array $with = [];
    protected int $perPage = 50;

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', $this->modelClass);

        $query = $this->modelClass::query()->with($this->with);
        $this->applyFilters($query, $request);

        $perPage = (int) $request->get('per_page', $this->perPage);
        return response()->json($query->paginate(min($perPage, 200)));
    }

    public function show(string $id): JsonResponse
    {
        $model = $this->modelClass::with($this->with)->findOrFail($id);
        $this->authorize('view', $model);
        return response()->json($model);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', $this->modelClass);
        $data = $request->validate($this->rules);
        $model = $this->modelClass::create($data); // company_id auto-fill via BelongsToCompany
        return response()->json($model->fresh($this->with), 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $model = $this->modelClass::findOrFail($id);
        $this->authorize('update', $model);
        $data = $request->validate($this->updateRules() ?: $this->rules);
        $model->update($data);
        return response()->json($model->fresh($this->with));
    }

    public function destroy(string $id): JsonResponse
    {
        $model = $this->modelClass::findOrFail($id);
        $this->authorize('delete', $model);
        $model->delete();
        return response()->json(null, 204);
    }

    /** Переопределить для PATCH-валидации (по умолчанию = store). */
    protected function updateRules(): array
    {
        return [];
    }

    /** Хук для произвольных query-фильтров (?status=, ?user_id= и т.п.). */
    protected function applyFilters($query, Request $request): void
    {
        // override in child controllers
    }
}
