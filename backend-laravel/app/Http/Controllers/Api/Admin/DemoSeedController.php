<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

/**
 * Superadmin-only: наполнение демо-компании «ООО Демо».
 * POST /api/superadmin/demo/seed   { reset?: bool, headcount?: int }
 * POST /api/superadmin/demo/reset
 * GET  /api/superadmin/demo/status
 */
class DemoSeedController extends Controller
{
    private const NAME = 'ООО "Демо"';

    public function status(Request $request): JsonResponse
    {
        $this->requireSuperadmin($request);
        $company = DB::table('companies')->where('name', self::NAME)->first();
        if (!$company) {
            return response()->json(['exists' => false]);
        }
        $counts = [
            'users'         => DB::table('profiles')->where('company_id', $company->id)->count(),
            'departments'   => DB::table('departments')->where('company_id', $company->id)->count(),
            'positions'     => DB::table('positions')->where('company_id', $company->id)->count(),
            'tasks'         => DB::table('hr_tasks')->where('company_id', $company->id)->count(),
            'shop_products' => DB::table('shop_products')->where('company_id', $company->id)->count(),
            'shop_orders'   => DB::table('shop_orders')->where('company_id', $company->id)->count(),
            'initiatives'   => \Schema::hasTable('initiatives') ? DB::table('initiatives')->where('company_id', $company->id)->count() : 0,
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

        return response()->json([
            'exists'     => true,
            'company_id' => $company->id,
            'name'       => $company->name,
            'counts'     => $counts,
            'password'   => 'DemoPass!2026',
            'users'      => $users,
        ]);
    }

    public function seed(Request $request): JsonResponse
    {
        $this->requireSuperadmin($request);
        $reset = (bool) $request->boolean('reset', false);
        $headcount = (int) $request->input('headcount', 150);
        $params = ['--headcount' => $headcount];
        if ($reset) $params['--reset'] = true;

        Artisan::call('demo:seed', $params);
        $output = Artisan::output();
        return response()->json(['ok' => true, 'output' => $output]);
    }

    public function reset(Request $request): JsonResponse
    {
        $this->requireSuperadmin($request);
        Artisan::call('demo:seed', ['--reset' => true, '--headcount' => (int) $request->input('headcount', 150)]);
        return response()->json(['ok' => true, 'output' => Artisan::output()]);
    }

    private function requireSuperadmin(Request $request): void
    {
        $u = $request->user();
        if (!$u || !$u->hasRole('superadmin')) {
            abort(403, 'Only superadmin can manage demo company');
        }
    }
}
