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
 * Не возвращают 500 при промежуточных ошибках — каждый шаг изолируется,
 * чтобы можно было понять, на каком именно этапе падает запрос.
 */
class DiagController extends Controller
{
    public function dbProbe(Request $request): JsonResponse
    {
        $user = $request->user();
        $steps = [];
        $start = microtime(true);

        try {
            $domainUserId = method_exists($user, 'domainUserId') ? $user->domainUserId() : (string) $user?->id;
            $steps['auth'] = [
                'user_id' => $user?->id,
                'domain_user_id' => $domainUserId,
                'email' => $user?->email,
            ];

            // Step 1: profile row
            $t = microtime(true);
            try {
                $profileRow = DB::table('profiles')->where('user_id', $domainUserId)->first();
                $steps['profile_row'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'found' => (bool) $profileRow,
                    'company_id' => $profileRow->company_id ?? null,
                ];
            } catch (\Throwable $e) {
                $steps['profile_row'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'error' => $e->getMessage(),
                    'where' => $e->getFile() . ':' . $e->getLine(),
                ];
            }

            // Step 2: companyId via memoized method
            $t = microtime(true);
            try {
                $companyId = method_exists($user, 'companyId') ? $user->companyId() : null;
                $steps['company_id'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'value' => $companyId,
                ];
            } catch (\Throwable $e) {
                $steps['company_id'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'error' => $e->getMessage(),
                    'where' => $e->getFile() . ':' . $e->getLine(),
                ];
            }

            // Step 3: domain roles
            $t = microtime(true);
            try {
                $roles = method_exists($user, 'domainRoles') ? $user->domainRoles() : [];
                $steps['domain_roles'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'roles' => $roles,
                ];
            } catch (\Throwable $e) {
                $steps['domain_roles'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'error' => $e->getMessage(),
                    'where' => $e->getFile() . ':' . $e->getLine(),
                ];
            }

            // Step 4: hasRole superadmin (triggers Gate::before path)
            $t = microtime(true);
            try {
                $isSuperadmin = method_exists($user, 'hasRole') ? $user->hasRole('superadmin') : false;
                $steps['has_role_superadmin'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'value' => $isSuperadmin,
                ];
            } catch (\Throwable $e) {
                $steps['has_role_superadmin'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'error' => $e->getMessage(),
                    'where' => $e->getFile() . ':' . $e->getLine(),
                ];
            }

            // Step 5: Gate viewAny Position
            $t = microtime(true);
            try {
                $canViewAnyPosition = Gate::allows('viewAny', Position::class);
                $steps['gate_view_any_position'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'value' => $canViewAnyPosition,
                ];
            } catch (\Throwable $e) {
                $steps['gate_view_any_position'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'error' => $e->getMessage(),
                    'where' => $e->getFile() . ':' . $e->getLine(),
                ];
            }

            // Step 6: raw positions query with company_id
            $t = microtime(true);
            try {
                $rows = DB::table('positions')
                    ->where('company_id', $companyId ?? '__no_company__')
                    ->limit(1)
                    ->get();
                $steps['positions_company_query'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'count' => $rows->count(),
                    'first_id' => $rows->first()->id ?? null,
                ];
            } catch (\Throwable $e) {
                $steps['positions_company_query'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'error' => $e->getMessage(),
                    'where' => $e->getFile() . ':' . $e->getLine(),
                ];
            }

            // Step 7: raw positions query without company_id
            $t = microtime(true);
            try {
                $rows = DB::table('positions')->limit(1)->get();
                $steps['positions_no_scope_query'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'count' => $rows->count(),
                    'first_id' => $rows->first()->id ?? null,
                ];
            } catch (\Throwable $e) {
                $steps['positions_no_scope_query'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'error' => $e->getMessage(),
                    'where' => $e->getFile() . ':' . $e->getLine(),
                ];
            }

            // Step 8: explain positions query
            $t = microtime(true);
            try {
                $explain = DB::select("EXPLAIN SELECT * FROM positions WHERE company_id = ? LIMIT 1", [$companyId ?? '__no_company__']);
                $steps['positions_explain'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'explain' => array_map(fn($r) => (array) $r, $explain),
                ];
            } catch (\Throwable $e) {
                $steps['positions_explain'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'error' => $e->getMessage(),
                ];
            }

            // Step 9: count positions for this company (approx)
            $t = microtime(true);
            try {
                $count = DB::table('positions')->where('company_id', $companyId ?? '__no_company__')->count();
                $steps['positions_company_count'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'count' => $count,
                ];
            } catch (\Throwable $e) {
                $steps['positions_company_count'] = [
                    'time_ms' => round((microtime(true) - $t) * 1000, 2),
                    'error' => $e->getMessage(),
                ];
            }

            $steps['total_time_ms'] = round((microtime(true) - $start) * 1000, 2);
            return response()->json(['steps' => $steps]);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => $e->getMessage(),
                'where' => $e->getFile() . ':' . $e->getLine(),
                'steps' => $steps,
            ], 500);
        }
    }
}
