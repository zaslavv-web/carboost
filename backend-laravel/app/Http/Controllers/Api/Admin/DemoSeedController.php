<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

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
        $companies = DB::table('companies')
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(function ($c) {
                $c->users = DB::table('profiles')->where('company_id', $c->id)->count();
                return $c;
            });

        return response()->json([
            'default' => self::NAME,
            'companies' => $companies,
        ]);
    }

    public function status(Request $request): JsonResponse
    {
        $this->requireSuperadmin($request);
        $name = $this->companyName($request);
        $company = DB::table('companies')->where('name', $name)->first();
        if (!$company) {
            return response()->json(['exists' => false, 'name' => $name]);
        }
        $counts = [
            'users'         => DB::table('profiles')->where('company_id', $company->id)->count(),
            'departments'   => DB::table('departments')->where('company_id', $company->id)->count(),
            'positions'     => DB::table('positions')->where('company_id', $company->id)->count(),
            'tasks'         => DB::table('hr_tasks')->where('company_id', $company->id)->count(),
            'shop_products' => DB::table('shop_products')->where('company_id', $company->id)->count(),
            'shop_orders'   => DB::table('shop_orders')->where('company_id', $company->id)->count(),
            'initiatives'   => \Schema::hasTable('initiatives') ? DB::table('initiatives')->where('company_id', $company->id)->count() : 0,
            'career_templates'  => \Schema::hasTable('career_track_templates') ? DB::table('career_track_templates')->where('company_id', $company->id)->count() : 0,
            'career_assignments' => \Schema::hasTable('employee_career_assignments') ? DB::table('employee_career_assignments')->where('company_id', $company->id)->count() : 0,
        ];
        // Собираем список логинов (email + full_name + role) для UI-таблицы
        $users = DB::table('users')
            ->join('profiles', 'profiles.user_id', '=', 'users.id')
            ->leftJoin('user_roles', 'user_roles.user_id', '=', 'users.id')
            ->where('profiles.company_id', $company->id)
            ->orderBy('user_roles.role')
            ->orderBy('users.email')
            ->select('users.email', 'profiles.full_name', 'user_roles.role')
            ->get();

        $positions = DB::table('positions')
            ->where('company_id', $company->id)
            ->orderBy('department')->orderBy('title')
            ->get(['id', 'title', 'department']);

        return response()->json([
            'exists'     => true,
            'company_id' => $company->id,
            'name'       => $company->name,
            'counts'     => $counts,
            'password'   => 'DemoPass!2026',
            'users'      => $users,
            'positions'  => $positions,
        ]);

    }

    public function seed(Request $request): JsonResponse
    {
        $this->requireSuperadmin($request);
        $reset = (bool) $request->boolean('reset', false);
        $headcount = (int) $request->input('headcount', 150);
        $params = ['--headcount' => $headcount, '--name' => $this->companyName($request)];
        if ($reset) $params['--reset'] = true;

        Artisan::call('demo:seed', $params);
        $output = Artisan::output();
        return response()->json(['ok' => true, 'output' => $output]);
    }

    public function reset(Request $request): JsonResponse
    {
        $this->requireSuperadmin($request);
        Artisan::call('demo:seed', [
            '--reset' => true,
            '--headcount' => (int) $request->input('headcount', 150),
            '--name' => $this->companyName($request),
        ]);
        return response()->json(['ok' => true, 'output' => Artisan::output()]);
    }

    /** Идемпотентно догоняет контент во всех рабочих модулях существующей компании. */
    public function content(Request $request): JsonResponse
    {
        $this->requireSuperadmin($request);
        $exitCode = Artisan::call('demo:seed', [
            '--only-content' => true,
            '--name' => $this->companyName($request),
        ]);

        return response()->json([
            'ok' => $exitCode === 0,
            'output' => Artisan::output(),
        ], $exitCode === 0 ? 200 : 422);
    }

    /** Догоняющее назначение карьерных треков без полного пересидинга. */
    public function careerTracks(Request $request): JsonResponse
    {
        $this->requireSuperadmin($request);
        $name = $this->companyName($request);
        $exitCode = Artisan::call('demo:seed', ['--only-career' => true, '--name' => $name]);
        $output = Artisan::output();
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
