<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Position;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * Диагностические endpoint'ы для production-расследований.
 *
 * Важно: try/catch НЕ ловит фатальные ошибки PHP (memory_limit,
 * max_execution_time). Поэтому перед каждым шагом пишется «маячок» в
 * storage/logs/probe.jsonl с немедленным сбросом на диск — даже если процесс
 * умрёт, последний записанный маркер назовёт шаг-убийцу.
 */
class DiagController extends Controller
{
    private const PROBE_LOG = 'logs/probe.jsonl';

    /**
     * Куда писать диагностические файлы. storage/logs на шаред-хостинге может
     * быть недоступен на запись из-под веб-пользователя (владелец — CLI-юзер),
     * и тогда все @file_put_contents молча теряются. Поэтому есть фолбэк в
     * системный temp: лучше маркеры во временной папке, чем никаких.
     */
    public static function diagFile(string $name): string
    {
        $dir = storage_path('logs');
        if (!is_dir($dir) || !is_writable($dir)) {
            $dir = sys_get_temp_dir();
        }

        return rtrim($dir, '/') . '/' . basename($name);
    }

    /** Записать маркер шага. Пишем сразу на диск, без буферов Laravel. */
    private function mark(string $step, array $extra = []): void
    {
        @file_put_contents(
            self::diagFile('probe.jsonl'),
            json_encode(array_merge([
                'ts'        => date('c'),
                'step'      => $step,
                'mem_mb'    => round(memory_get_usage(true) / 1048576, 1),
                'peak_mb'   => round(memory_get_peak_usage(true) / 1048576, 1),
                'elapsed_s' => isset($_SERVER['REQUEST_TIME_FLOAT'])
                    ? round(microtime(true) - (float) $_SERVER['REQUEST_TIME_FLOAT'], 2)
                    : null,
            ], $extra), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n",
            FILE_APPEND
        );
    }

    /** Изолированный шаг: маркер до, замер времени, поимка исключений. */
    private function step(array &$steps, string $name, callable $fn): void
    {
        $this->mark('begin:' . $name);
        $t = microtime(true);
        try {
            $steps[$name] = array_merge(
                ['time_ms' => 0.0],
                (array) $fn()
            );
            $steps[$name]['time_ms'] = round((microtime(true) - $t) * 1000, 2);
            $this->mark('end:' . $name, ['time_ms' => $steps[$name]['time_ms']]);
        } catch (\Throwable $e) {
            $steps[$name] = [
                'time_ms' => round((microtime(true) - $t) * 1000, 2),
                'error'   => mb_substr($e->getMessage(), 0, 500),
                'where'   => $e->getFile() . ':' . $e->getLine(),
            ];
            $this->mark('error:' . $name, ['error' => mb_substr($e->getMessage(), 0, 300)]);
        }
    }

    public function dbProbe(Request $request): JsonResponse
    {
        // Свежий файл маркеров на каждый прогон — иначе не отличить текущий
        // запуск от предыдущего упавшего.
        @file_put_contents(storage_path(self::PROBE_LOG), '');

        $user  = $request->user();
        $steps = [];
        $start = microtime(true);
        $this->mark('probe_start', ['uri' => $request->getRequestUri()]);

        $domainUserId = null;
        $companyId    = null;

        // 0. Шаг вообще без БД — проверяем, что дело именно в базе.
        $this->step($steps, 'no_db', fn () => ['ok' => true, 'loaded_files' => count(get_included_files())]);

        // 1. Соединения из config/database.php: установка PDO отдельно от запроса.
        //    Если сконфигурировано несколько соединений и одно из них недоступно,
        //    именно тут будет виден многосекундный connect-timeout.
        $connections = array_keys((array) config('database.connections', []));
        foreach ($connections as $name) {
            $this->step($steps, 'connect:' . $name, function () use ($name) {
                $t   = microtime(true);
                $pdo = DB::connection($name)->getPdo();
                $connectMs = round((microtime(true) - $t) * 1000, 2);
                $t   = microtime(true);
                DB::connection($name)->select('select 1');
                return [
                    'driver'     => DB::connection($name)->getDriverName(),
                    'connect_ms' => $connectMs,
                    'select1_ms' => round((microtime(true) - $t) * 1000, 2),
                    'server'     => (string) @$pdo->getAttribute(\PDO::ATTR_SERVER_VERSION),
                ];
            });
        }

        // 2. Профиль пользователя
        $this->step($steps, 'auth', function () use ($user, &$domainUserId) {
            $domainUserId = method_exists($user, 'domainUserId') ? $user->domainUserId() : (string) $user?->id;
            return ['user_id' => $user?->id, 'domain_user_id' => $domainUserId, 'email' => $user?->email];
        });

        $this->step($steps, 'profile_row', function () use (&$domainUserId) {
            $row = DB::table('profiles')->where('user_id', $domainUserId)->first();
            return ['found' => (bool) $row, 'company_id' => $row->company_id ?? null];
        });

        $this->step($steps, 'company_id', function () use ($user, &$companyId) {
            $companyId = method_exists($user, 'companyId') ? $user->companyId() : null;
            return ['value' => $companyId];
        });

        $this->step($steps, 'domain_roles', fn () => [
            'roles' => method_exists($user, 'domainRoles') ? $user->domainRoles() : [],
        ]);

        $this->step($steps, 'has_role_superadmin', fn () => [
            'value' => method_exists($user, 'hasRole') ? $user->hasRole('superadmin') : false,
        ]);

        $this->step($steps, 'gate_view_any_position', fn () => [
            'value' => Gate::allows('viewAny', Position::class),
        ]);

        $this->step($steps, 'schema_columns_positions', fn () => [
            'count' => count(\Illuminate\Support\Facades\Schema::getColumnListing('positions')),
        ]);

        $this->step($steps, 'positions_company_query', function () use (&$companyId) {
            $rows = DB::table('positions')->where('company_id', $companyId ?? '__no_company__')->limit(1)->get();
            return ['count' => $rows->count(), 'first_id' => $rows->first()->id ?? null];
        });

        $this->step($steps, 'positions_no_scope_query', function () {
            $rows = DB::table('positions')->limit(1)->get();
            return ['count' => $rows->count()];
        });

        $this->step($steps, 'positions_explain', function () use (&$companyId) {
            $explain = DB::select('EXPLAIN SELECT * FROM positions WHERE company_id = ? LIMIT 1', [$companyId ?? '__no_company__']);
            return ['explain' => array_map(fn ($r) => (array) $r, $explain)];
        });

        $this->step($steps, 'positions_company_count', function () use (&$companyId) {
            return ['count' => DB::table('positions')->where('company_id', $companyId ?? '__no_company__')->count()];
        });

        $this->step($steps, 'profiles_company_count', function () use (&$companyId) {
            return ['count' => DB::table('profiles')->where('company_id', $companyId ?? '__no_company__')->count()];
        });

        $steps['total_time_ms'] = round((microtime(true) - $start) * 1000, 2);
        $steps['peak_mb']       = round(memory_get_peak_usage(true) / 1048576, 1);
        $this->mark('probe_end', ['total_time_ms' => $steps['total_time_ms']]);

        return response()->json(['steps' => $steps]);
    }

    /** Маркеры последнего прогона db-probe — читаются даже если тот упал фаталом. */
    public function lastProbe(): JsonResponse
    {
        $file = storage_path(self::PROBE_LOG);
        if (!is_readable($file)) {
            return response()->json(['markers' => [], 'note' => 'probe ещё не запускался']);
        }
        $lines   = array_slice(array_filter(explode("\n", (string) @file_get_contents($file))), -200);
        $markers = array_map(fn ($l) => json_decode($l, true) ?: ['raw' => $l], $lines);

        return response()->json([
            'markers'      => $markers,
            'last_marker'  => end($markers) ?: null,
            'markers_count' => count($markers),
        ]);
    }

    /** Последние фатальные ошибки целиком (сообщение, место, память, время). */
    public function lastFatal(Request $request): JsonResponse
    {
        $file  = storage_path('logs/api-fatals.jsonl');
        $limit = min(50, max(1, (int) $request->query('limit', 10)));
        if (!is_readable($file)) {
            return response()->json(['fatals' => [], 'note' => 'файл появится после первого фатала на обновлённом коде']);
        }
        $size = @filesize($file) ?: 0;
        $raw  = '';
        if ($fh = @fopen($file, 'rb')) {
            if ($size > 262144) {
                fseek($fh, -262144, SEEK_END);
                fgets($fh);
            }
            $raw = (string) stream_get_contents($fh);
            fclose($fh);
        }
        $lines  = array_slice(array_filter(explode("\n", $raw)), -$limit);
        $fatals = array_map(fn ($l) => json_decode($l, true) ?: ['raw' => mb_substr($l, 0, 500)], $lines);

        return response()->json(['fatals' => $fatals, 'count' => count($fatals)]);
    }

    /** Лимиты PHP и состояние пула соединений MySQL. */
    public function limits(): JsonResponse
    {
        $ini = [];
        foreach ([
            'memory_limit', 'max_execution_time', 'max_input_time',
            'default_socket_timeout', 'mysql.connect_timeout', 'mysqlnd.net_read_timeout',
            'pcre.backtrack_limit', 'output_buffering', 'zend.enable_gc',
        ] as $k) {
            $ini[$k] = ini_get($k);
        }

        $out = [
            'sapi'          => PHP_SAPI,
            'php_version'   => PHP_VERSION,
            'ini'           => $ini,
            'ini_files'     => [
                'loaded' => php_ini_loaded_file(),
                'scanned' => php_ini_scanned_files(),
            ],
            'app_debug'     => (bool) config('app.debug'),
            'default_connection' => config('database.default'),
            'connections'   => array_keys((array) config('database.connections', [])),
        ];

        try {
            $vars = DB::select("SHOW VARIABLES WHERE Variable_name IN (
                'max_connections','max_user_connections','wait_timeout','interactive_timeout',
                'net_read_timeout','net_write_timeout','max_allowed_packet','version'
            )");
            foreach ($vars as $v) {
                $arr = (array) $v;
                $out['mysql_variables'][$arr['Variable_name'] ?? ''] = $arr['Value'] ?? null;
            }
        } catch (\Throwable $e) {
            $out['mysql_variables'] = ['error' => mb_substr($e->getMessage(), 0, 300)];
        }

        try {
            $status = DB::select("SHOW STATUS WHERE Variable_name IN (
                'Threads_connected','Threads_running','Connections','Aborted_connects','Max_used_connections'
            )");
            foreach ($status as $v) {
                $arr = (array) $v;
                $out['mysql_status'][$arr['Variable_name'] ?? ''] = $arr['Value'] ?? null;
            }
        } catch (\Throwable $e) {
            $out['mysql_status'] = ['error' => mb_substr($e->getMessage(), 0, 300)];
        }

        return response()->json($out);
    }
}
