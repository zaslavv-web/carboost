<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Integration\ApiContext;
use App\Integration\ExternalIdResolver;
use App\Integration\ResourceDefinition;
use App\Integration\ResourcePresenter;
use App\Integration\ResourceRegistry;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Универсальный вход и выход данных по ресурсам реестра.
 *
 *   GET    /api/v1/{resource}            — выборка (фильтры, курсор, updated_since)
 *   GET    /api/v1/{resource}/{id}       — запись по id или ext:<system>:<external_id>
 *   POST   /api/v1/{resource}            — создание
 *   PATCH  /api/v1/{resource}/{id}       — изменение
 *   DELETE /api/v1/{resource}/{id}       — удаление
 *   POST   /api/v1/{resource}/upsert     — идемпотентная запись по внешнему ключу
 *
 * Компания берётся из ключа и подставляется в каждый запрос явно.
 */
class ResourceController extends Controller
{
    private const MAX_LIMIT = 200;
    private const DEFAULT_LIMIT = 50;

    public function index(Request $request, string $resource): JsonResponse
    {
        [$context, $definition] = $this->resolve($request, $resource, 'list', read: true);

        $query = $definition->query($context->companyId);
        $this->applyFilters($query, $definition, $request);

        $limit = $this->limit($request);
        $cursor = $request->query('cursor');
        $table = $query->getModel()->getTable();

        if (is_string($cursor) && $cursor !== '') {
            $query->where($table . '.id', '>', $cursor);
        }

        $rows = $query->orderBy($table . '.id')->limit($limit + 1)->get();
        $hasMore = $rows->count() > $limit;
        $rows = $rows->take($limit);

        return response()->json([
            'data' => $rows->map(fn (Model $m) => ResourcePresenter::present($definition, $m))->values(),
            'page' => [
                'limit'       => $limit,
                'has_more'    => $hasMore,
                'next_cursor' => $hasMore ? (string) $rows->last()->getKey() : null,
            ],
        ]);
    }

    public function show(Request $request, string $resource, string $id): JsonResponse
    {
        [$context, $definition] = $this->resolve($request, $resource, 'read', read: true);

        $model = $this->findRecord($context, $definition, $id);
        if ($model === null) {
            return $this->notFound($resource, $id);
        }

        return response()->json(['data' => $this->withReferences($context, $definition, $model)]);
    }

    public function store(Request $request, string $resource): JsonResponse
    {
        [$context, $definition] = $this->resolve($request, $resource, 'create', read: false);

        $replay = $this->replayIdempotent($request, $context);
        if ($replay !== null) {
            return $replay;
        }

        $attributes = $this->writableInput($request->all(), $definition);
        if ($attributes === []) {
            return $this->badRequest('Не передано ни одного поля, доступного для записи');
        }

        $model = $this->newModel($definition, $context->companyId, $attributes);
        $model->save();

        $payload = ['data' => $this->withReferences($context, $definition, $model->refresh())];
        $this->rememberIdempotent($request, $context, 201, $payload);

        return response()->json($payload, 201);
    }

    public function update(Request $request, string $resource, string $id): JsonResponse
    {
        [$context, $definition] = $this->resolve($request, $resource, 'update', read: false);

        $model = $this->findRecord($context, $definition, $id);
        if ($model === null) {
            return $this->notFound($resource, $id);
        }

        $attributes = $this->writableInput($request->all(), $definition);
        if ($attributes === []) {
            return $this->badRequest('Не передано ни одного поля, доступного для записи');
        }

        $model->fill($attributes)->save();

        return response()->json(['data' => $this->withReferences($context, $definition, $model->refresh())]);
    }

    public function destroy(Request $request, string $resource, string $id): JsonResponse
    {
        [$context, $definition] = $this->resolve($request, $resource, 'delete', read: false);

        $model = $this->findRecord($context, $definition, $id);
        if ($model === null) {
            return $this->notFound($resource, $id);
        }

        $model->delete();

        return response()->json(['deleted' => true, 'id' => $id]);
    }

    /**
     * Идемпотентная запись по ключу внешней системы.
     *
     * Тело: {"external_system":"1c_zup","external_id":"00-1","data":{...}}
     * Повторный вызов с тем же external_id обновляет ту же запись.
     */
    public function upsert(Request $request, string $resource): JsonResponse
    {
        [$context, $definition] = $this->resolve($request, $resource, 'update', read: false);

        $system = trim((string) $request->input('external_system', ''));
        $externalId = trim((string) $request->input('external_id', ''));
        if ($system === '' || $externalId === '') {
            return $this->badRequest('Обязательны поля external_system и external_id');
        }

        $data = $request->input('data');
        if (!is_array($data)) {
            return $this->badRequest('Поле data должно быть объектом');
        }

        $attributes = $this->writableInput($data, $definition);
        if ($attributes === []) {
            return $this->badRequest('В data нет ни одного поля, доступного для записи');
        }

        $internalId = ExternalIdResolver::internalId($context->companyId, $system, $definition->name, $externalId);
        $model = $internalId === null
            ? null
            : $definition->query($context->companyId)->find($internalId);

        // Резервный путь: у таблицы есть своя колонка external_id (profiles,
        // departments, positions) — сопоставление могло быть заведено импортом
        // из 1С ещё до появления external_references.
        if ($model === null && $definition->externalId) {
            $model = $definition->query($context->companyId)->where('external_id', $externalId)->first();
        }

        $created = false;
        if ($model === null) {
            if (!$definition->allows('create')) {
                return $this->badRequest('Ресурс не поддерживает создание записей');
            }
            $model = $this->newModel($definition, $context->companyId, $attributes);
            $created = true;
        } else {
            $model->fill($attributes);
        }

        if ($definition->externalId && !array_key_exists('external_id', $attributes)) {
            $model->external_id = $externalId;
        }

        $model->save();

        ExternalIdResolver::link($context->companyId, $system, $definition->name, $externalId, (string) $model->getKey());

        return response()->json(
            ['data' => $this->withReferences($context, $definition, $model->refresh()), 'created' => $created],
            $created ? 201 : 200,
        );
    }

    // ---------------------------------------------------------------- helpers

    /**
     * @return array{0:ApiContext,1:ResourceDefinition}
     */
    private function resolve(Request $request, string $resource, string $op, bool $read): array
    {
        $context = $request->attributes->get('api_context');
        abort_unless($context instanceof ApiContext, 401, 'Требуется API-ключ');

        $definition = ResourceRegistry::find($resource);
        abort_if($definition === null, 404, "Ресурс «{$resource}» не найден");

        abort_unless(
            $definition->allows($op),
            405,
            "Операция «{$op}» недоступна для ресурса «{$definition->name}»",
        );

        $scope = $read ? $definition->readScope() : $definition->writeScope();
        abort_unless($context->hasScope($scope), 403, "Ключу не выдан скоуп «{$scope}»");

        return [$context, $definition];
    }

    private function findRecord(ApiContext $context, ResourceDefinition $definition, string $id): ?Model
    {
        $external = ExternalIdResolver::parse($id);
        if ($external !== null) {
            [$system, $externalId] = $external;
            $internalId = ExternalIdResolver::internalId($context->companyId, $system, $definition->name, $externalId);
            if ($internalId === null && $definition->externalId) {
                return $definition->query($context->companyId)->where('external_id', $externalId)->first();
            }

            return $internalId === null ? null : $definition->query($context->companyId)->find($internalId);
        }

        return $definition->query($context->companyId)->find($id);
    }

    private function newModel(ResourceDefinition $definition, string $companyId, array $attributes): Model
    {
        /** @var Model $model */
        $model = new ($definition->model)();
        $model->fill($attributes);

        // Компанию задаём сами: у машинного клиента нет auth()->user(), на
        // который опирается автоподстановка в BelongsToCompany.
        if ($definition->companyResolver === null) {
            $model->company_id = $companyId;
        }

        return $model;
    }

    /** Наружу принимаем только объявленные в реестре поля. */
    private function writableInput(array $input, ResourceDefinition $definition): array
    {
        return array_intersect_key($input, array_flip($definition->write));
    }

    private function withReferences(ApiContext $context, ResourceDefinition $definition, Model $model): array
    {
        return ResourcePresenter::present($definition, $model) + [
            'external_references' => ExternalIdResolver::referencesFor(
                $context->companyId,
                $definition->name,
                (string) $model->getKey(),
            ),
        ];
    }

    private function applyFilters(Builder $query, ResourceDefinition $definition, Request $request): void
    {
        $table = $query->getModel()->getTable();

        foreach ($definition->filters as $field) {
            if (!$request->has($field)) {
                continue;
            }

            $value = $request->query($field);
            if (is_array($value)) {
                $query->whereIn($table . '.' . $field, $value);
                continue;
            }

            // Значение через запятую читается как список — удобно для статусов.
            if (is_string($value) && str_contains($value, ',')) {
                $query->whereIn($table . '.' . $field, array_map('trim', explode(',', $value)));
                continue;
            }

            $query->where($table . '.' . $field, $value);
        }

        // Инкрементальная синхронизация: забрать всё, что изменилось с прошлого раза.
        $since = $request->query('updated_since');
        if (is_string($since) && $since !== '') {
            try {
                $query->where($table . '.updated_at', '>=', new \DateTimeImmutable($since));
            } catch (\Throwable) {
                // некорректная дата — фильтр просто не применяется
            }
        }
    }

    private function limit(Request $request): int
    {
        $limit = (int) $request->query('limit', (string) self::DEFAULT_LIMIT);

        return max(1, min($limit, self::MAX_LIMIT));
    }

    // ------------------------------------------------------------ идемпотентность

    /**
     * Повтор ответа на запрос с тем же Idempotency-Key.
     *
     * Внешние системы ретраят POST при сетевых сбоях: без этого один и тот же
     * приказ о приёме сотрудника создал бы несколько записей.
     */
    private function replayIdempotent(Request $request, ApiContext $context): ?JsonResponse
    {
        $key = trim((string) $request->header('Idempotency-Key', ''));
        if ($key === '') {
            return null;
        }

        $row = DB::table('integration_idempotency')
            ->where('company_id', $context->companyId)
            ->where('idempotency_key', $key)
            ->first();

        if ($row === null) {
            return null;
        }

        $body = json_decode((string) $row->response_body, true);

        return response()->json(is_array($body) ? $body : [], (int) $row->response_status)
            ->header('Idempotent-Replay', 'true');
    }

    private function rememberIdempotent(Request $request, ApiContext $context, int $status, array $body): void
    {
        $key = trim((string) $request->header('Idempotency-Key', ''));
        if ($key === '') {
            return;
        }

        try {
            DB::table('integration_idempotency')->insert([
                'id'              => (string) \Illuminate\Support\Str::uuid(),
                'company_id'      => $context->companyId,
                'idempotency_key' => $key,
                'request_hash'    => hash('sha256', (string) json_encode($request->all())),
                'response_status' => $status,
                'response_body'   => json_encode($body, JSON_UNESCAPED_UNICODE),
                'created_at'      => now(),
            ]);
        } catch (\Throwable) {
            // Гонка двух одинаковых ретраев: запись уже есть — это и есть цель.
        }
    }

    private function notFound(string $resource, string $id): JsonResponse
    {
        return response()->json([
            'error'   => 'not_found',
            'message' => "Запись «{$id}» ресурса «{$resource}» не найдена",
        ], 404);
    }

    private function badRequest(string $message): JsonResponse
    {
        return response()->json(['error' => 'bad_request', 'message' => $message], 422);
    }
}
