<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;


/**
 * Superadmin-only: наполнение демо-компании (по умолчанию «ООО Демо»).
 * GET  /api/superadmin/demo/companies
 * GET  /api/superadmin/demo/status?company=...
 * POST /api/superadmin/demo/seed   { reset?: bool, headcount?: int, company?: string }
 * POST /api/superadmin/demo/reset  { headcount?: int, company?: string }
 */
class DemoSeedController extends Controller
{
    private const NAME = 'ООО "Демо"';

    /** Список компаний для выпадающего списка + название по умолчанию. */
    public function companies(Request $request): JsonResponse
    {
        $this->requireSuperadmin($request);

        try {
            // Один агрегирующий запрос вместо N+1: на проде лимит соединений MySQL жёсткий.
            $columns = ['companies.id', 'companies.name'];
            if (Schema::hasColumn('companies', 'slug')) {
                $columns[] = 'companies.slug';
            }

            $query = DB::table('companies')->select($columns);
            if (Schema::hasTable('profiles')) {
                $query->selectSub(
                    DB::table('profiles')->selectRaw('count(*)')->whereColumn('profiles.company_id', 'companies.id'),
                    'users'
                );
            } else {
                $query->selectRaw('0 as users');
            }

            $companies = $query->orderBy('companies.name')->limit(500)->get();

            return response()->json([
                'default' => self::NAME,
                'companies' => $companies,
            ]);
        } catch (\Throwable $e) {
            return $this->failure('companies', $e);
        }
    }

    public function status(Request $request): JsonResponse
    {
        $this->requireSuperadmin($request);
        $name = $this->companyName($request);

        try {
            $company = DB::table('companies')->where('name', $name)->first();
            if (!$company) {
                return response()->json(['exists' => false, 'name' => $name]);
            }

            $count = fn (string $table) => Schema::hasTable($table) && Schema::hasColumn($table, 'company_id')
                ? DB::table($table)->where('company_id', $company->id)->count()
                : 0;

            $counts = [
                'users'         => $count('profiles'),
                'departments'   => $count('departments'),
                'positions'     => $count('positions'),
                'tasks'         => $count('hr_tasks'),
                'shop_products' => $count('shop_products'),
                'shop_orders'   => $count('shop_orders'),
                'initiatives'   => $count('initiatives'),
                'career_templates'  => $count('career_track_templates'),
                'career_assignments' => $count('employee_career_assignments'),
            ];

            // Собираем список логинов (email + full_name + role) для UI-таблицы
            $usersQuery = DB::table('users')
                ->join('profiles', 'profiles.user_id', '=', 'users.id')
                ->where('profiles.company_id', $company->id);

            if (Schema::hasTable('user_roles')) {
                $usersQuery->leftJoin('user_roles', 'user_roles.user_id', '=', 'users.id')
                    ->orderBy('user_roles.role')
                    ->select('users.email', 'profiles.full_name', 'user_roles.role');
            } else {
                $usersQuery->selectRaw('users.email, profiles.full_name, null as role');
            }

            $users = $usersQuery->orderBy('users.email')->limit(1000)->get();

            $positionsQuery = DB::table('positions')->where('company_id', $company->id);
            $hasDepartment = Schema::hasColumn('positions', 'department');
            if ($hasDepartment) {
                $positionsQuery->orderBy('department');
            }
            $positions = $positionsQuery->orderBy('title')->limit(1000)
                ->get($hasDepartment ? ['id', 'title', 'department'] : ['id', 'title']);

            return response()->json([
                'exists'     => true,
                'company_id' => $company->id,
                'name'       => $company->name,
                'counts'     => $counts,
                'password'   => 'DemoPass!2026',
                'users'      => $users,
                'positions'  => $positions,
            ]);
        } catch (\Throwable $e) {
            return $this->failure('status', $e);
        }
    }

    /** Единый формат читаемой ошибки вместо голого 500. */
    private function failure(string $action, \Throwable $e): JsonResponse
    {
        Log::error('demo-seed: ошибка ' . $action, [
            'exception' => $e::class,
            'message' => $e->getMessage(),
            'where' => $e->getFile() . ':' . $e->getLine(),
            'trace' => $e->getTraceAsString(),
        ]);

        $where = basename($e->getFile()) . ':' . $e->getLine();

        return response()->json([
            'ok' => false,
            'message' => $e->getMessage() . ' (' . $where . ')',
            'exception' => $e::class,
            'where' => $where,
            'diagnostics' => ['action' => $action, 'where' => $where, 'exception' => $e::class],
        ], 422);
    }


    public function seed(Request $request): JsonResponse
    {
        $this->requireSuperadmin($request);
        $reset = (bool) $request->boolean('reset', false);
        $headcount = (int) $request->input('headcount', 150);
        $params = ['--headcount' => $headcount, '--name' => $this->companyName($request)];
        if ($reset) $params['--reset'] = true;

        return $this->runSeed('seed', $params);
    }

    public function reset(Request $request): JsonResponse
    {
        $this->requireSuperadmin($request);

        return $this->runSeed('reset', [
            '--reset' => true,
            '--headcount' => (int) $request->input('headcount', 150),
            '--name' => $this->companyName($request),
        ]);
    }

    /** Идемпотентно догоняет контент во всех рабочих модулях существующей компании. */
    public function content(Request $request): JsonResponse
    {
        $this->requireSuperadmin($request);

        return $this->runSeed('content', [
            '--only-content' => true,
            '--name' => $this->companyName($request),
        ]);
    }

    /**
     * Единая точка запуска demo:seed: снимает лимиты времени/памяти,
     * ловит любые исключения и возвращает читаемую диагностику вместо голого 500.
     */
    private function runSeed(string $action, array $params): JsonResponse
    {
        $this->relaxRuntimeLimits();

        try {
            $exitCode = Artisan::call('demo:seed', $params);
            $output = Artisan::output();

            if ($exitCode !== 0) {
                Log::warning('demo-seed: команда завершилась с ошибкой', [
                    'action' => $action,
                    'params' => $params,
                    'exit_code' => $exitCode,
                    'output' => mb_substr($output, -4000),
                ]);
            }

            return response()->json([
                'ok' => $exitCode === 0,
                'output' => $output,
                'exit_code' => $exitCode,
                'message' => $exitCode === 0
                    ? 'Готово'
                    : 'Команда demo:seed завершилась с кодом ' . $exitCode . '. Подробности — в выводе ниже.',
                'last_step' => $this->lastStep($output),
                'diagnostics' => [
                    'output' => $output,
                    'exit_code' => $exitCode,
                    'last_step' => $this->lastStep($output),
                ],
            ], $exitCode === 0 ? 200 : 422);
        } catch (\Throwable $e) {
            $output = '';
            try {
                $output = Artisan::output();
            } catch (\Throwable) {
                // вывод недоступен — не мешаем диагностике
            }

            Log::error('demo-seed: исключение при сидинге', [
                'action' => $action,
                'params' => $params,
                'exception' => $e::class,
                'message' => $e->getMessage(),
                'where' => $e->getFile() . ':' . $e->getLine(),
                'output' => mb_substr($output, -4000),
                'trace' => $e->getTraceAsString(),
            ]);

            $where = basename($e->getFile()) . ':' . $e->getLine();

            return response()->json([
                'ok' => false,
                'message' => $e->getMessage() . ' (' . $where . ')',
                'exception' => $e::class,
                'where' => $where,
                'last_step' => $this->lastStep($output),
                'output' => $output,
                'diagnostics' => [
                    'output' => $output,
                    'where' => $where,
                    'exception' => $e::class,
                    'last_step' => $this->lastStep($output),
                ],
            ], 422);
        }
    }


    /** Последняя строка прогресса вида «4/12 Создаю 150 сотрудников…». */
    private function lastStep(string $output): ?string
    {
        $lines = array_values(array_filter(array_map('trim', preg_split('/\r?\n/', $output) ?: [])));
        for ($i = count($lines) - 1; $i >= 0; $i--) {
            if (preg_match('/^\d+(\.\d+)?\/?\d*\s/u', $lines[$i])) {
                return $lines[$i];
            }
        }
        return $lines ? end($lines) : null;
    }

    /** Полный сидинг долгий и тяжёлый — поднимаем лимиты PHP на время запроса. */
    private function relaxRuntimeLimits(): void
    {
        @set_time_limit(0);
        @ini_set('max_execution_time', '0');
        @ini_set('memory_limit', '1024M');
        DB::disableQueryLog();
    }


    /** Догоняющее назначение карьерных треков без полного пересидинга. */
    public function careerTracks(Request $request): JsonResponse
    {
        $this->requireSuperadmin($request);
        $name = $this->companyName($request);
        $this->relaxRuntimeLimits();
        try {
            $exitCode = Artisan::call('demo:seed', ['--only-career' => true, '--name' => $name]);
            $output = Artisan::output();
        } catch (\Throwable $e) {
            Log::error('demo-seed: исключение при назначении карьерных треков', [
                'company' => $name,
                'exception' => $e::class,
                'message' => $e->getMessage(),
                'where' => $e->getFile() . ':' . $e->getLine(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'ok' => false,
                'message' => $e->getMessage(),
                'exception' => $e::class,
                'where' => basename($e->getFile()) . ':' . $e->getLine(),
                'output' => '',
            ], 422);
        }

        $company = DB::table('companies')->where('name', $name)->first();
        $assignments = $company
            ? DB::table('employee_career_assignments')->where('company_id', $company->id)->count()
            : 0;
        $templates = $company
            ? DB::table('career_track_templates')->where('company_id', $company->id)->count()
            : 0;
        $employeesWithoutPosition = $company
            ? DB::table('profiles')->where('company_id', $company->id)->whereNull('position_id')->count()
            : 0;
        $employeesWithoutTrack = $company
            ? DB::table('profiles as p')
                ->where('p.company_id', $company->id)
                ->whereNotNull('p.position_id')
                ->whereNotExists(function ($query) use ($company) {
                    $query->selectRaw('1')
                        ->from('career_track_templates as ct')
                        ->whereColumn('ct.from_position_id', 'p.position_id')
                        ->where('ct.company_id', $company->id)
                        ->where('ct.is_active', true);
                })
                ->count()
            : 0;
        $controlUser = $company
            ? DB::table('users')
                ->join('profiles', 'profiles.user_id', '=', 'users.id')
                ->where('profiles.company_id', $company->id)
                ->where('users.email', 'like', 'employee.76@%')
                ->select('profiles.user_id', 'users.email')
                ->first()
            : null;
        $controlAssignments = $controlUser
            ? DB::table('employee_career_assignments')
                ->where('company_id', $company->id)
                ->where('user_id', $controlUser->user_id)
                ->count()
            : null;
        $ok = $exitCode === 0 && $assignments > 0;
        $message = $ok
            ? "Карьерные треки назначены: {$assignments}"
            : (! $company
                ? "Компания «{$name}» не найдена. Сначала создайте тестовые данные."
                : "Не удалось назначить карьерные треки: назначений 0, сотрудников без должности — {$employeesWithoutPosition}, без подходящего шаблона — {$employeesWithoutTrack}.");

        return response()->json([
            'ok' => $ok,
            'message' => $message,
            'output' => $output,
            'career_templates' => $templates,
            'career_assignments' => $assignments,
            'control_employee_email' => $controlUser?->email,
            'control_employee_assignments' => $controlAssignments,
            'diagnostics' => [
                'output' => $output,
                'exit_code' => $exitCode,
                'employees_without_position' => $employeesWithoutPosition,
                'employees_without_track' => $employeesWithoutTrack,
            ],
        ], $ok ? 200 : 422);
    }

    /** Название компании из запроса (или демо-компания по умолчанию). */
    private function companyName(Request $request): string
    {
        $name = trim((string) $request->input('company', ''));
        return $name !== '' ? mb_substr($name, 0, 190) : self::NAME;
    }

    private function requireSuperadmin(Request $request): void
    {
        $u = $request->user();
        if (!$u || !$u->hasRole('superadmin')) {
            abort(403, 'Only superadmin can manage demo company');
        }
    }
}
