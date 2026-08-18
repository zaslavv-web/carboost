<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Epic B1 — Интеграция с 1С:ЗУП 8.3.
 *
 *  B1.1 Синхронизация оргструктуры (подразделения, должности)
 *  B1.2 Кадровые события (сотрудники) через EnterpriseData/OData
 *  B1.3 Импорт начислений и удержаний
 *  B1.4 UI маппинга полей (каталог целевых полей + сохранение маппинга)
 *  B1.5 Журнал синхронизаций с построчными ошибками и retry
 *
 * Все выборки/записи — raw SQL (DB::table) без Eloquent-гидрации.
 */
class OneCIntegrationController extends Controller
{
    private const ENTITIES = ['department', 'position', 'employee', 'payroll'];

    /** Каталог целевых полей платформы для UI маппинга (B1.4). */
    private const TARGET_FIELDS = [
        'department' => [
            ['key' => 'external_id', 'label' => 'Код 1С (external_id)', 'required' => false],
            ['key' => 'name',        'label' => 'Наименование',          'required' => true],
            ['key' => 'parent_name', 'label' => 'Родительское подразделение', 'required' => false],
        ],
        'position' => [
            ['key' => 'external_id', 'label' => 'Код 1С (external_id)', 'required' => false],
            ['key' => 'name',        'label' => 'Название должности',    'required' => true],
            ['key' => 'department',  'label' => 'Подразделение',         'required' => false],
        ],
        'employee' => [
            ['key' => 'external_id', 'label' => 'Табельный номер / код 1С', 'required' => false],
            ['key' => 'email',       'label' => 'Email',            'required' => false],
            ['key' => 'full_name',   'label' => 'ФИО',              'required' => true],
            ['key' => 'position',    'label' => 'Должность',        'required' => false],
            ['key' => 'department',  'label' => 'Подразделение',    'required' => false],
            ['key' => 'hire_date',   'label' => 'Дата приёма',      'required' => false],
            ['key' => 'grade',       'label' => 'Грейд',            'required' => false],
        ],
        'payroll' => [
            ['key' => 'external_id', 'label' => 'Табельный номер сотрудника', 'required' => true],
            ['key' => 'period',      'label' => 'Период (ГГГГ-ММ)', 'required' => true],
            ['key' => 'kind',        'label' => 'Тип (начисление/удержание)', 'required' => false],
            ['key' => 'code',        'label' => 'Код вида расчёта', 'required' => false],
            ['key' => 'name',        'label' => 'Наименование',     'required' => false],
            ['key' => 'amount',      'label' => 'Сумма',            'required' => true],
        ],
    ];

    /** Пути OData 1С:ЗУП по умолчанию. */
    private const ODATA_PATHS = [
        'department' => 'Catalog_ПодразделенияОрганизаций',
        'position'   => 'Catalog_Должности',
        'employee'   => 'Catalog_Сотрудники',
        'payroll'    => 'AccumulationRegister_НачисленияУдержанияПоСотрудникам',
    ];

    // ================= Connections =================

    public function indexConnections(Request $request): JsonResponse
    {
        $rows = DB::table('integration_connections')
            ->where('company_id', $this->companyId($request))
            ->orderByDesc('created_at')
            ->limit(100)
            ->get()
            ->map(fn ($r) => $this->publicConnection($r));

        return response()->json(['data' => $rows]);
    }

    public function storeConnection(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $data = $this->validateConnection($request);
        $companyId = $this->companyId($request);
        if (!$companyId) {
            return response()->json(['ok' => false, 'message' => 'Не указана компания.'], 422);
        }

        $id = (string) Str::uuid();
        DB::table('integration_connections')->insert([
            'id'          => $id,
            'company_id'  => $companyId,
            'provider'    => '1c_zup',
            'name'        => $data['name'],
            'base_url'    => $data['base_url'] ?? null,
            'auth_type'   => $data['auth_type'] ?? 'basic',
            'username'    => $data['username'] ?? null,
            'secret'      => isset($data['secret']) && $data['secret'] !== '' ? Crypt::encryptString($data['secret']) : null,
            'is_active'   => $data['is_active'] ?? true,
            'verify_tls'  => $data['verify_tls'] ?? true,
            'options'     => json_encode($data['options'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE),
            'created_by'  => $this->userId($request),
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        return response()->json($this->publicConnection(
            DB::table('integration_connections')->where('id', $id)->first()
        ), 201);
    }

    public function updateConnection(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $conn = $this->findConnection($id, $request);
        $data = $this->validateConnection($request, false);

        $patch = ['updated_at' => now()];
        foreach (['name', 'base_url', 'auth_type', 'username', 'is_active', 'verify_tls'] as $f) {
            if (array_key_exists($f, $data)) $patch[$f] = $data[$f];
        }
        if (array_key_exists('options', $data)) {
            $patch['options'] = json_encode($data['options'], JSON_UNESCAPED_UNICODE);
        }
        if (!empty($data['secret'])) {
            $patch['secret'] = Crypt::encryptString($data['secret']);
        }

        DB::table('integration_connections')->where('id', $conn->id)->update($patch);

        return response()->json($this->publicConnection(
            DB::table('integration_connections')->where('id', $conn->id)->first()
        ));
    }

    public function destroyConnection(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $conn = $this->findConnection($id, $request);
        DB::table('integration_connections')->where('id', $conn->id)->delete();
        return response()->json(['ok' => true]);
    }

    /** Проверка доступности OData-сервиса 1С. */
    public function testConnection(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $conn = $this->findConnection($id, $request);
        if (!$conn->base_url) {
            return response()->json(['ok' => false, 'message' => 'Не указан адрес OData-сервиса.'], 422);
        }

        $url = rtrim($conn->base_url, '/') . '/$metadata';
        try {
            $req = Http::timeout(12)->withOptions(['verify' => (bool) $conn->verify_tls]);
            if ($conn->auth_type === 'basic' && $conn->username) {
                $req = $req->withBasicAuth($conn->username, $this->secretOf($conn));
            }
            $res = $req->get($url);
            $ok = $res->successful();
            DB::table('integration_connections')->where('id', $conn->id)->update([
                'last_status' => $ok ? 'success' : 'failed',
                'last_error'  => $ok ? null : ('HTTP ' . $res->status()),
                'updated_at'  => now(),
            ]);
            return response()->json([
                'ok'      => $ok,
                'status'  => $res->status(),
                'message' => $ok ? 'Соединение установлено, метаданные получены.' : 'Сервис ответил ошибкой HTTP ' . $res->status(),
            ], $ok ? 200 : 200);
        } catch (\Throwable $e) {
            DB::table('integration_connections')->where('id', $conn->id)->update([
                'last_status' => 'failed',
                'last_error'  => Str::limit($e->getMessage(), 500),
                'updated_at'  => now(),
            ]);
            return response()->json(['ok' => false, 'message' => 'Нет связи с 1С: ' . Str::limit($e->getMessage(), 300)]);
        }
    }

    // ================= Field mappings (B1.4) =================

    public function targetFields(): JsonResponse
    {
        return response()->json([
            'entities'    => self::ENTITIES,
            'fields'      => self::TARGET_FIELDS,
            'odata_paths' => self::ODATA_PATHS,
        ]);
    }

    public function indexMappings(Request $request): JsonResponse
    {
        $q = DB::table('integration_field_mappings')->where('company_id', $this->companyId($request));
        if ($request->filled('entity')) $q->where('entity', $request->query('entity'));
        if ($request->filled('connection_id')) $q->where('connection_id', $request->query('connection_id'));
        return response()->json(['data' => $q->orderBy('entity')->limit(500)->get()]);
    }

    /** Полная замена маппинга для сущности. */
    public function saveMappings(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $data = $request->validate([
            'entity'                 => 'required|in:department,position,employee,payroll',
            'connection_id'          => 'nullable|string|max:64',
            'mappings'               => 'present|array',
            'mappings.*.source_field'=> 'required|string|max:200',
            'mappings.*.target_field'=> 'required|string|max:100',
            'mappings.*.transform'   => 'nullable|string|max:32',
        ]);
        $companyId = $this->companyId($request);

        DB::table('integration_field_mappings')
            ->where('company_id', $companyId)
            ->where('entity', $data['entity'])
            ->when(!empty($data['connection_id']), fn ($q) => $q->where('connection_id', $data['connection_id']))
            ->delete();

        $rows = [];
        foreach ($data['mappings'] as $m) {
            $rows[] = [
                'id'            => (string) Str::uuid(),
                'company_id'    => $companyId,
                'connection_id' => $data['connection_id'] ?? null,
                'entity'        => $data['entity'],
                'source_field'  => $m['source_field'],
                'target_field'  => $m['target_field'],
                'transform'     => $m['transform'] ?? null,
                'is_active'     => true,
                'created_at'    => now(),
                'updated_at'    => now(),
            ];
        }
        if ($rows) DB::table('integration_field_mappings')->insert($rows);

        return response()->json(['ok' => true, 'count' => count($rows)]);
    }

    // ================= Import =================

    /** Разбор файла без записи: колонки + первые строки. */
    public function preview(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $request->validate(['file' => 'required|file|max:20480']);
        try {
            $rows = $this->parseFile($request->file('file'));
        } catch (\Throwable $e) {
            return response()->json(['ok' => false, 'message' => 'Не удалось разобрать файл: ' . Str::limit($e->getMessage(), 200)], 422);
        }

        $columns = $rows ? array_keys($rows[0]) : [];
        return response()->json([
            'ok'      => true,
            'columns' => $columns,
            'total'   => count($rows),
            'sample'  => array_slice($rows, 0, 20),
        ]);
    }

    /** Импорт из файла (CSV / EnterpriseData XML). */
    public function importFile(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $request->validate([
            'file'          => 'required|file|max:20480',
            'entity'        => 'required|in:department,position,employee,payroll',
            'connection_id' => 'nullable|string|max:64',
            'dry_run'       => 'nullable',
        ]);

        try {
            $rows = $this->parseFile($request->file('file'));
        } catch (\Throwable $e) {
            return response()->json(['ok' => false, 'message' => 'Не удалось разобрать файл: ' . Str::limit($e->getMessage(), 200)], 422);
        }

        return $this->runImport(
            $request,
            $request->input('entity'),
            $rows,
            'file',
            $request->input('connection_id'),
            filter_var($request->input('dry_run', false), FILTER_VALIDATE_BOOLEAN)
        );
    }

    /** Загрузка данных напрямую из OData 1С:ЗУП. */
    public function pull(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $data = $request->validate([
            'connection_id' => 'required|string|max:64',
            'entity'        => 'required|in:department,position,employee,payroll',
            'path'          => 'nullable|string|max:300',
            'top'           => 'nullable|integer|min:1|max:5000',
            'dry_run'       => 'nullable',
        ]);
        $conn = $this->findConnection($data['connection_id'], $request);
        if (!$conn->base_url) {
            return response()->json(['ok' => false, 'message' => 'Не указан адрес OData-сервиса.'], 422);
        }

        $path = $data['path'] ?: (self::ODATA_PATHS[$data['entity']] ?? null);
        $url  = rtrim($conn->base_url, '/') . '/' . ltrim((string) $path, '/');

        try {
            $req = Http::timeout(60)->withOptions(['verify' => (bool) $conn->verify_tls]);
            if ($conn->auth_type === 'basic' && $conn->username) {
                $req = $req->withBasicAuth($conn->username, $this->secretOf($conn));
            }
            $res = $req->get($url, ['$format' => 'json', '$top' => $data['top'] ?? 1000]);
            if (!$res->successful()) {
                return response()->json(['ok' => false, 'message' => 'ЗУП ответил HTTP ' . $res->status()], 200);
            }
            $body = $res->json();
            $rows = $body['value'] ?? (is_array($body) ? $body : []);
        } catch (\Throwable $e) {
            return response()->json(['ok' => false, 'message' => 'Ошибка обращения к 1С: ' . Str::limit($e->getMessage(), 300)], 200);
        }

        return $this->runImport(
            $request,
            $data['entity'],
            array_map(fn ($r) => $this->flatten((array) $r), $rows),
            'odata',
            $conn->id,
            filter_var($request->input('dry_run', false), FILTER_VALIDATE_BOOLEAN)
        );
    }

    // ================= Journal (B1.5) =================

    public function indexRuns(Request $request): JsonResponse
    {
        $q = DB::table('integration_sync_runs')->where('company_id', $this->companyId($request));
        if ($request->filled('entity')) $q->where('entity', $request->query('entity'));
        return response()->json(['data' => $q->orderByDesc('created_at')->limit(100)->get()]);
    }

    public function runRecords(string $id, Request $request): JsonResponse
    {
        $companyId = $this->companyId($request);
        $run = DB::table('integration_sync_runs')->where('id', $id)->where('company_id', $companyId)->first();
        if (!$run) abort(404);

        $q = DB::table('integration_sync_records')->where('run_id', $id);
        if ($request->filled('action')) $q->where('action', $request->query('action'));

        return response()->json([
            'run'  => $run,
            'data' => $q->orderBy('created_at')->limit(500)->get(),
        ]);
    }

    /** Повторная попытка по упавшим строкам запуска. */
    public function retryRun(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $companyId = $this->companyId($request);
        $run = DB::table('integration_sync_runs')->where('id', $id)->where('company_id', $companyId)->first();
        if (!$run) abort(404);

        $failed = DB::table('integration_sync_records')
            ->where('run_id', $id)->where('action', 'failed')->limit(2000)->get();
        if ($failed->isEmpty()) {
            return response()->json(['ok' => true, 'message' => 'Нет упавших строк для повтора.', 'retried' => 0]);
        }

        $rows = $failed->map(fn ($r) => json_decode((string) $r->payload, true) ?: [])->all();
        $response = $this->runImport($request, $run->entity, $rows, $run->source, $run->connection_id, false, true);

        DB::table('integration_sync_records')->whereIn('id', $failed->pluck('id'))
            ->update(['retry_count' => DB::raw('retry_count + 1'), 'updated_at' => now()]);

        return $response;
    }

    // ================= Core import engine =================

    private function runImport(
        Request $request,
        string $entity,
        array $rows,
        string $source,
        ?string $connectionId,
        bool $dryRun,
        bool $alreadyNormalized = false
    ): JsonResponse {
        $companyId = $this->companyId($request);
        if (!$companyId) {
            return response()->json(['ok' => false, 'message' => 'Не указана компания.'], 422);
        }

        $mappings = $alreadyNormalized ? collect() : DB::table('integration_field_mappings')
            ->where('company_id', $companyId)
            ->where('entity', $entity)
            ->where('is_active', true)
            ->get();

        $runId = (string) Str::uuid();
        DB::table('integration_sync_runs')->insert([
            'id'            => $runId,
            'company_id'    => $companyId,
            'connection_id' => $connectionId,
            'entity'        => $entity,
            'source'        => $source,
            'status'        => 'running',
            'dry_run'       => $dryRun,
            'total'         => count($rows),
            'started_at'    => now(),
            'created_by'    => $this->userId($request),
            'created_at'    => now(),
            'updated_at'    => now(),
        ]);

        $stats = ['created' => 0, 'updated' => 0, 'skipped' => 0, 'failed' => 0];
        $records = [];

        foreach (array_slice($rows, 0, 5000) as $raw) {
            $row = $alreadyNormalized ? $raw : $this->applyMapping((array) $raw, $mappings);
            try {
                [$action, $targetId, $title, $error] = $dryRun
                    ? ['skipped', null, $this->titleOf($entity, $row), 'Пробный прогон (без записи)']
                    : $this->upsertRow($entity, $row, $companyId, $runId);
            } catch (\Throwable $e) {
                [$action, $targetId, $title, $error] = ['failed', null, $this->titleOf($entity, $row), Str::limit($e->getMessage(), 400)];
            }

            $stats[$action] = ($stats[$action] ?? 0) + 1;
            $records[] = [
                'id'          => (string) Str::uuid(),
                'company_id'  => $companyId,
                'run_id'      => $runId,
                'entity'      => $entity,
                'external_id' => isset($row['external_id']) ? Str::limit((string) $row['external_id'], 190, '') : null,
                'title'       => $title ? Str::limit((string) $title, 290, '') : null,
                'action'      => $action,
                'target_id'   => $targetId,
                'payload'     => json_encode($row, JSON_UNESCAPED_UNICODE),
                'error'       => $error,
                'retry_count' => 0,
                'created_at'  => now(),
                'updated_at'  => now(),
            ];

            if (count($records) >= 200) {
                DB::table('integration_sync_records')->insert($records);
                $records = [];
            }
        }
        if ($records) DB::table('integration_sync_records')->insert($records);

        $status = $stats['failed'] > 0 ? ($stats['failed'] === count($rows) ? 'failed' : 'partial') : 'success';
        DB::table('integration_sync_runs')->where('id', $runId)->update([
            'status'        => $status,
            'created_count' => $stats['created'],
            'updated_count' => $stats['updated'],
            'skipped_count' => $stats['skipped'],
            'failed_count'  => $stats['failed'],
            'finished_at'   => now(),
            'updated_at'    => now(),
        ]);

        if ($connectionId) {
            DB::table('integration_connections')->where('id', $connectionId)->update([
                'last_sync_at' => now(),
                'last_status'  => $status,
                'updated_at'   => now(),
            ]);
        }

        return response()->json([
            'ok'     => true,
            'run_id' => $runId,
            'status' => $status,
            'stats'  => $stats,
            'total'  => count($rows),
        ]);
    }

    /** @return array{0:string,1:?string,2:?string,3:?string} [action, targetId, title, error] */
    private function upsertRow(string $entity, array $row, string $companyId, string $runId): array
    {
        return match ($entity) {
            'department' => $this->upsertDepartment($row, $companyId),
            'position'   => $this->upsertPosition($row, $companyId),
            'employee'   => $this->upsertEmployee($row, $companyId),
            'payroll'    => $this->upsertPayroll($row, $companyId, $runId),
            default      => ['skipped', null, null, 'Неизвестная сущность'],
        };
    }

    private function upsertDepartment(array $row, string $companyId): array
    {
        $name = trim((string) ($row['name'] ?? ''));
        if ($name === '') return ['failed', null, null, 'Пустое наименование подразделения'];

        $extId = $row['external_id'] ?? null;
        $q = DB::table('departments')->where('company_id', $companyId);
        $existing = $extId && Schema::hasColumn('departments', 'external_id')
            ? (clone $q)->where('external_id', $extId)->first()
            : null;
        $existing = $existing ?: (clone $q)->where('name', $name)->first();

        $payload = $this->onlyExistingColumns('departments', [
            'name'        => $name,
            'external_id' => $extId,
            'updated_at'  => now(),
        ]);

        if ($existing) {
            DB::table('departments')->where('id', $existing->id)->update($payload);
            return ['updated', (string) $existing->id, $name, null];
        }

        $id = (string) Str::uuid();
        DB::table('departments')->insert($this->onlyExistingColumns('departments', array_merge($payload, [
            'id'         => $id,
            'company_id' => $companyId,
            'created_at' => now(),
        ])));
        return ['created', $id, $name, null];
    }

    private function upsertPosition(array $row, string $companyId): array
    {
        $name = trim((string) ($row['name'] ?? ''));
        if ($name === '') return ['failed', null, null, 'Пустое название должности'];

        $extId = $row['external_id'] ?? null;
        $q = DB::table('positions')->where('company_id', $companyId);
        $existing = $extId && Schema::hasColumn('positions', 'external_id')
            ? (clone $q)->where('external_id', $extId)->first()
            : null;
        $existing = $existing ?: (clone $q)->where('title', $name)->first();


        $payload = $this->onlyExistingColumns('positions', [
            'title'       => $name,
            'name'        => $name,
            'department'  => $row['department'] ?? null,
            'external_id' => $extId,
            'updated_at'  => now(),
        ]);

        if ($existing) {
            DB::table('positions')->where('id', $existing->id)->update($payload);
            return ['updated', (string) $existing->id, $name, null];
        }

        $id = (string) Str::uuid();
        DB::table('positions')->insert($this->onlyExistingColumns('positions', array_merge($payload, [
            'id'         => $id,
            'company_id' => $companyId,
            'created_by' => $this->currentUserId,
            'created_at' => now(),
        ])));

        return ['created', $id, $name, null];
    }

    private function upsertEmployee(array $row, string $companyId): array
    {
        $fullName = trim((string) ($row['full_name'] ?? ''));
        $email    = strtolower(trim((string) ($row['email'] ?? '')));
        $extId    = $row['external_id'] ?? null;
        $title    = $fullName ?: $email ?: (string) $extId;

        $profile = null;
        if ($extId && Schema::hasColumn('profiles', 'external_id')) {
            $profile = DB::table('profiles')->where('company_id', $companyId)->where('external_id', $extId)->first();
        }
        if (!$profile && $email && Schema::hasTable('users')) {
            $userId = DB::table('users')->whereRaw('LOWER(email) = ?', [$email])->value('id');
            if ($userId) $profile = DB::table('profiles')->where('user_id', $userId)->first();
        }
        if (!$profile && $fullName) {
            $profile = DB::table('profiles')->where('company_id', $companyId)->where('full_name', $fullName)->first();
        }

        if (!$profile) {
            return ['skipped', null, $title, 'Сотрудник не найден в платформе (нет учётной записи) — создайте приглашение'];
        }

        $patch = array_filter([
            'full_name'   => $fullName ?: null,
            'position'    => $row['position'] ?? null,
            'department'  => $row['department'] ?? null,
            'hire_date'   => $this->toDate($row['hire_date'] ?? null),
            'grade'       => $row['grade'] ?? null,
            'external_id' => $extId,
        ], fn ($v) => $v !== null && $v !== '');
        $patch['updated_at'] = now();

        DB::table('profiles')->where('id', $profile->id)
            ->update($this->onlyExistingColumns('profiles', $patch));

        return ['updated', (string) $profile->user_id, $title, null];
    }

    private function upsertPayroll(array $row, string $companyId, string $runId): array
    {
        $extId  = trim((string) ($row['external_id'] ?? ''));
        $period = trim((string) ($row['period'] ?? ''));
        if ($period === '') return ['failed', null, $extId, 'Не указан период'];
        if (preg_match('/^(\d{4})[-.\/](\d{2})/', $period, $m)) $period = $m[1] . '-' . $m[2];

        $amount = (float) str_replace([' ', ','], ['', '.'], (string) ($row['amount'] ?? 0));
        $kind   = in_array(($row['kind'] ?? 'accrual'), ['deduction', 'удержание'], true) ? 'deduction' : 'accrual';

        $userId = null;
        if ($extId && Schema::hasColumn('profiles', 'external_id')) {
            $userId = DB::table('profiles')->where('company_id', $companyId)->where('external_id', $extId)->value('user_id');
        }

        $existing = DB::table('payroll_entries')
            ->where('company_id', $companyId)
            ->where('external_id', $extId)
            ->where('period', $period)
            ->where('code', $row['code'] ?? null)
            ->first();

        $payload = [
            'user_id'       => $userId ? (string) $userId : null,
            'external_id'   => $extId,
            'period'        => $period,
            'kind'          => $kind,
            'code'          => $row['code'] ?? null,
            'name'          => $row['name'] ?? null,
            'amount'        => $amount,
            'source_run_id' => $runId,
            'updated_at'    => now(),
        ];

        if ($existing) {
            DB::table('payroll_entries')->where('id', $existing->id)->update($payload);
            return ['updated', (string) $existing->id, ($row['name'] ?? $extId), null];
        }

        $id = (string) Str::uuid();
        DB::table('payroll_entries')->insert(array_merge($payload, [
            'id'         => $id,
            'company_id' => $companyId,
            'created_at' => now(),
        ]));
        return ['created', $id, ($row['name'] ?? $extId), null];
    }

    /** Сводка по начислениям (B1.3) для UI. */
    public function payrollSummary(Request $request): JsonResponse
    {
        $companyId = $this->companyId($request);
        $q = DB::table('payroll_entries')->where('company_id', $companyId);
        if ($request->filled('period')) $q->where('period', $request->query('period'));

        $rows = (clone $q)
            ->select('period', 'kind', DB::raw('count(*) as entries'), DB::raw('sum(amount) as total'))
            ->groupBy('period', 'kind')
            ->orderByDesc('period')
            ->limit(60)
            ->get();

        return response()->json(['data' => $rows]);
    }

    // ================= Parsing / mapping =================

    private function applyMapping(array $raw, $mappings): array
    {
        $flat = $this->flatten($raw);
        if ($mappings->isEmpty()) {
            // Без маппинга — считаем, что колонки уже названы целевыми полями.
            return $flat;
        }
        $out = [];
        foreach ($mappings as $m) {
            $value = $flat[$m->source_field] ?? null;
            $out[$m->target_field] = $this->transform($value, $m->transform);
        }
        return $out;
    }

    private function transform($value, ?string $transform)
    {
        if ($value === null) return null;
        return match ($transform) {
            'trim'   => trim((string) $value),
            'upper'  => mb_strtoupper((string) $value),
            'lower'  => mb_strtolower((string) $value),
            'date'   => $this->toDate($value),
            'number' => (float) str_replace([' ', ','], ['', '.'], (string) $value),
            'bool'   => filter_var($value, FILTER_VALIDATE_BOOLEAN),
            default  => is_scalar($value) ? $value : json_encode($value, JSON_UNESCAPED_UNICODE),
        };
    }

    private function toDate($value): ?string
    {
        if (!$value) return null;
        try {
            return \Carbon\Carbon::parse((string) $value)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }

    /** Плоский массив скалярных значений (для OData/XML-объектов). */
    private function flatten(array $row, string $prefix = ''): array
    {
        $out = [];
        foreach ($row as $k => $v) {
            $key = $prefix ? "{$prefix}.{$k}" : (string) $k;
            if (is_array($v) || is_object($v)) {
                $out += $this->flatten((array) $v, $key);
            } else {
                $out[$key] = $v;
            }
        }
        return $out;
    }

    /** CSV (;/,) или EnterpriseData XML → массив ассоциативных строк. */
    private function parseFile($file): array
    {
        $ext = strtolower($file->getClientOriginalExtension() ?: '');
        $content = file_get_contents($file->getRealPath());
        if ($content === false) throw new \RuntimeException('Файл не читается');

        if (!mb_detect_encoding($content, 'UTF-8', true)) {
            $converted = @iconv('windows-1251', 'UTF-8//IGNORE', $content);
            if ($converted !== false) $content = $converted;
        }

        if ($ext === 'xml' || str_starts_with(ltrim($content), '<')) {
            return $this->parseXml($content);
        }
        return $this->parseCsv($content);
    }

    private function parseCsv(string $content): array
    {
        $lines = preg_split("/\r\n|\n|\r/", trim($content));
        if (!$lines) return [];
        $delimiter = substr_count($lines[0], ';') >= substr_count($lines[0], ',') ? ';' : ',';
        $header = array_map(fn ($h) => trim($h, " \t\"'\xEF\xBB\xBF"), str_getcsv(array_shift($lines), $delimiter));

        $rows = [];
        foreach ($lines as $line) {
            if (trim($line) === '') continue;
            $cells = str_getcsv($line, $delimiter);
            $row = [];
            foreach ($header as $i => $name) {
                if ($name === '') continue;
                $row[$name] = isset($cells[$i]) ? trim((string) $cells[$i]) : null;
            }
            $rows[] = $row;
        }
        return $rows;
    }

    private function parseXml(string $content): array
    {
        $prev = libxml_use_internal_errors(true);
        $xml = simplexml_load_string($content, null, LIBXML_NOCDATA | LIBXML_NONET);
        libxml_use_internal_errors($prev);
        if (!$xml) throw new \RuntimeException('Некорректный XML');

        $json = json_decode(json_encode($xml), true) ?: [];

        // EnterpriseData: ищем самый крупный повторяющийся список объектов.
        $best = [];
        $walk = function ($node) use (&$walk, &$best) {
            if (!is_array($node)) return;
            foreach ($node as $value) {
                if (is_array($value) && array_is_list($value) && count($value) > count($best)) {
                    $objects = array_filter($value, 'is_array');
                    if (count($objects) === count($value)) $best = $value;
                }
                if (is_array($value)) $walk($value);
            }
        };
        $walk($json);

        if (!$best) {
            $first = reset($json);
            $best = is_array($first) ? [$first] : [];
        }

        return array_map(fn ($r) => $this->flatten((array) $r), $best);
    }

    private function titleOf(string $entity, array $row): ?string
    {
        return $row['full_name'] ?? $row['name'] ?? $row['title'] ?? ($row['external_id'] ?? null);
    }

    private function onlyExistingColumns(string $table, array $data): array
    {
        $out = [];
        foreach ($data as $k => $v) {
            if (Schema::hasColumn($table, $k)) $out[$k] = $v;
        }
        return $out;
    }

    // ================= helpers =================

    private function publicConnection($r)
    {
        if (!$r) return null;
        unset($r->secret);
        $r->has_secret = true;
        $r->options = json_decode((string) $r->options, true) ?: [];
        return $r;
    }

    private function secretOf($conn): string
    {
        if (!$conn->secret) return '';
        try {
            return Crypt::decryptString($conn->secret);
        } catch (\Throwable) {
            return '';
        }
    }

    private function validateConnection(Request $request, bool $creating = true): array
    {
        return $request->validate([
            'name'       => ($creating ? 'required' : 'sometimes') . '|string|max:200',
            'base_url'   => 'nullable|string|max:500',
            'auth_type'  => 'nullable|in:basic,none',
            'username'   => 'nullable|string|max:200',
            'secret'     => 'nullable|string|max:500',
            'is_active'  => 'nullable|boolean',
            'verify_tls' => 'nullable|boolean',
            'options'    => 'nullable|array',
        ]);
    }

    private function findConnection(string $id, Request $request)
    {
        $conn = DB::table('integration_connections')
            ->where('id', $id)
            ->where('company_id', $this->companyId($request))
            ->first();
        if (!$conn) abort(404);
        return $conn;
    }

    private function assertHr(Request $request): void
    {
        $user = $request->user();
        $ok = false;
        try {
            $ok = $user && ($user->hasRole('hrd') || $user->hasRole('hr')
                || $user->hasRole('company_admin') || $user->hasRole('superadmin'));
        } catch (\Throwable) {
            $ok = false;
        }
        if (!$ok) abort(403);
    }

    private function userId(Request $request): ?string
    {
        $user = $request->user();
        return $user ? (string) $user->getAuthIdentifier() : null;
    }

    private function companyId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) return null;
        try {
            if (method_exists($user, 'companyId')) {
                $cid = $user->companyId();
                if ($cid) return (string) $cid;
            }
        } catch (\Throwable) {
            // fall through
        }
        if (Schema::hasTable('profiles')) {
            $cid = DB::table('profiles')->where('user_id', $this->userId($request))->value('company_id');
            if ($cid) return (string) $cid;
        }
        return null;
    }
}
