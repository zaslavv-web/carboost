<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Integration\ApiContext;
use App\Integration\ResourceDefinition;
use App\Integration\ResourceRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Самоописание API: каталог ресурсов, событий и схема OpenAPI.
 *
 * Каталог собирается из того же реестра, что и маршруты, поэтому не может
 * разойтись с реальным поведением.
 */
class MetaController extends Controller
{
    /** Префикс монтирования из bootstrap/app.php. */
    private const BASE_PATH = '/api/integration/v1';

    public function resources(Request $request): JsonResponse
    {
        $context = $request->attributes->get('api_context');
        abort_unless($context instanceof ApiContext, 401, 'Требуется API-ключ');

        $resources = [];
        foreach (ResourceRegistry::all() as $definition) {
            $resources[] = [
                'name'        => $definition->name,
                'title'       => $definition->title,
                'scope_read'  => $definition->readScope(),
                'scope_write' => $definition->writeScope(),
                'granted'     => [
                    'read'  => $context->hasScope($definition->readScope()),
                    'write' => $context->hasScope($definition->writeScope()),
                ],
                'operations'  => $definition->ops,
                'fields'      => ['read' => $definition->read, 'write' => $definition->write],
                'filters'     => $definition->filters,
                'external_id' => $definition->externalId,
                'events'      => array_map(
                    static fn (string $verb) => $definition->name . '.' . $verb,
                    ['created', 'updated', 'deleted'],
                ),
            ];
        }

        return response()->json([
            'version'   => 'v1',
            'resources' => $resources,
            'scopes'    => ResourceRegistry::scopes(),
            'events'    => ResourceRegistry::events(),
        ]);
    }

    /** Машиночитаемая схема — её можно скормить генератору клиентов. */
    public function openapi(): JsonResponse
    {
        $paths = [];

        foreach (ResourceRegistry::all() as $definition) {
            $base = self::BASE_PATH . '/' . $definition->name;
            $item = [];

            if ($definition->allows('list')) {
                $item['get'] = $this->operation(
                    "Список: {$definition->title}",
                    $definition->readScope(),
                    $this->listParameters($definition),
                );
            }
            if ($definition->allows('create')) {
                $item['post'] = $this->operation(
                    "Создать: {$definition->title}",
                    $definition->writeScope(),
                    [],
                    $this->bodySchema($definition),
                );
            }
            if ($item !== []) {
                $paths[$base] = $item;
            }

            $byId = [];
            if ($definition->allows('read')) {
                $byId['get'] = $this->operation("Запись: {$definition->title}", $definition->readScope(), $this->idParameter());
            }
            if ($definition->allows('update')) {
                $byId['patch'] = $this->operation("Изменить: {$definition->title}", $definition->writeScope(), $this->idParameter(), $this->bodySchema($definition));
            }
            if ($definition->allows('delete')) {
                $byId['delete'] = $this->operation("Удалить: {$definition->title}", $definition->writeScope(), $this->idParameter());
            }
            if ($byId !== []) {
                $paths[$base . '/{id}'] = $byId;
            }

            if ($definition->allows('update')) {
                $paths[$base . '/upsert'] = [
                    'post' => $this->operation(
                        "Идемпотентная запись по внешнему ключу: {$definition->title}",
                        $definition->writeScope(),
                        [],
                        [
                            'required' => true,
                            'content'  => ['application/json' => ['schema' => [
                                'type'     => 'object',
                                'required' => ['external_system', 'external_id', 'data'],
                                'properties' => [
                                    'external_system' => ['type' => 'string'],
                                    'external_id'     => ['type' => 'string'],
                                    'data'            => $this->bodySchema($definition)['content']['application/json']['schema'],
                                ],
                            ]]],
                        ],
                    ),
                ];
            }
        }

        $paths[self::BASE_PATH . '/events'] = [
            'get' => $this->operation('Фид событий платформы', 'events:read', [
                ['name' => 'since', 'in' => 'query', 'schema' => ['type' => 'integer'], 'description' => 'Курсор последней обработанной записи'],
                ['name' => 'event', 'in' => 'query', 'schema' => ['type' => 'string'], 'description' => 'Фильтр по событиям через запятую'],
                ['name' => 'resource', 'in' => 'query', 'schema' => ['type' => 'string']],
                ['name' => 'limit', 'in' => 'query', 'schema' => ['type' => 'integer', 'maximum' => 500]],
            ]),
        ];

        return response()->json([
            'openapi' => '3.0.3',
            'info'    => [
                'title'       => 'Growth Peak — интеграционное API',
                'version'     => '1.0.0',
                'description' => 'Двусторонний обмен данными: чтение и запись по всем ресурсам реестра, '
                    . 'события платформы через вебхуки и pull-фид.',
            ],
            'components' => [
                'securitySchemes' => [
                    'ApiKey' => [
                        'type'        => 'http',
                        'scheme'      => 'bearer',
                        'description' => 'Ключ вида gp_<prefix>_<secret> из раздела «Интеграции».',
                    ],
                ],
            ],
            'security' => [['ApiKey' => []]],
            'paths'    => $paths,
        ]);
    }

    private function operation(string $summary, string $scope, array $parameters, ?array $body = null): array
    {
        $op = [
            'summary'     => $summary,
            'description' => "Требуемый скоуп: `{$scope}`.",
            'parameters'  => $parameters,
            'responses'   => [
                '200' => ['description' => 'Успех'],
                '401' => ['description' => 'Ключ не передан или недействителен'],
                '403' => ['description' => 'Ключу не выдан нужный скоуп'],
                '404' => ['description' => 'Ресурс или запись не найдены'],
            ],
        ];

        if ($body !== null) {
            $op['requestBody'] = $body;
        }

        return $op;
    }

    private function idParameter(): array
    {
        return [[
            'name'        => 'id',
            'in'          => 'path',
            'required'    => true,
            'schema'      => ['type' => 'string'],
            'description' => 'UUID записи либо ext:<система>:<внешний id>',
        ]];
    }

    private function listParameters(ResourceDefinition $definition): array
    {
        $params = [
            ['name' => 'limit', 'in' => 'query', 'schema' => ['type' => 'integer', 'maximum' => 200]],
            ['name' => 'cursor', 'in' => 'query', 'schema' => ['type' => 'string']],
            [
                'name'        => 'updated_since',
                'in'          => 'query',
                'schema'      => ['type' => 'string', 'format' => 'date-time'],
                'description' => 'Инкрементальная выборка изменённых записей',
            ],
        ];

        foreach ($definition->filters as $filter) {
            $params[] = ['name' => $filter, 'in' => 'query', 'schema' => ['type' => 'string']];
        }

        return $params;
    }

    private function bodySchema(ResourceDefinition $definition): array
    {
        $properties = [];
        foreach ($definition->write as $field) {
            $properties[$field] = ['type' => 'string'];
        }

        return [
            'required' => true,
            'content'  => ['application/json' => ['schema' => [
                'type'       => 'object',
                'properties' => $properties,
            ]]],
        ];
    }
}
