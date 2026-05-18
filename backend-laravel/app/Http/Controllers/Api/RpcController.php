<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Generic Postgres RPC proxy (Phase 10).
 *
 * Drop-in replacement for `supabase.rpc(name, params)`. Whitelisted Postgres
 * functions are invoked through the SECURITY DEFINER chain — they already
 * enforce role/company checks via `auth.uid()`, which we set per-request
 * using `set_config('request.jwt.claim.sub', ...)` so existing functions
 * keep working unchanged after the migration.
 */
class RpcController extends Controller
{
    /**
     * name => [param_name => sql_type] in declared order.
     * sql_type is used only to cast NULL → typed NULL when the caller omits it.
     */
    protected const FUNCTIONS = [
        'verify_user'                    => ['_target_user_id' => 'uuid'],
        'reject_user'                    => ['_target_user_id' => 'uuid'],
        'delete_user'                    => ['_target_user_id' => 'uuid'],
        'assign_role'                    => ['_target_user_id' => 'uuid', '_role' => 'text'],
        'register_company'               => ['_name' => 'text'],
        'find_company_by_name'           => ['_name' => 'text'],
        'bulk_invite_employees'          => ['_invites' => 'jsonb'],
        'submit_employee_questionnaire'  => [
            '_questionnaire_id' => 'uuid', '_position_id' => 'uuid',
            '_other_position_title' => 'text', '_answers' => 'jsonb',
            '_skill_gaps' => 'jsonb', '_status' => 'text',
        ],
        'submit_career_step'             => [
            '_assignment_id' => 'uuid', '_step_order' => 'int',
            '_payload' => 'jsonb',
        ],
        'review_career_step'             => [
            '_submission_id' => 'uuid', '_approve' => 'bool', '_reason' => 'text',
        ],
        'create_shop_order'              => ['_items' => 'jsonb'],
        'fulfill_shop_order'             => [
            '_order_id' => 'uuid', '_approve' => 'bool', '_reason' => 'text',
        ],
        'award_currency'                 => [
            '_user_id' => 'uuid', '_company_id' => 'uuid', '_amount' => 'int',
            '_kind' => 'text', '_description' => 'text', '_reference_id' => 'uuid',
        ],
        'submit_demo_request'            => [
            '_name' => 'text', '_email' => 'text', '_company' => 'text',
            '_headcount' => 'int', '_source' => 'text',
        ],
        'submit_pricing_inquiry'         => [
            '_name' => 'text', '_email' => 'text', '_plan' => 'text',
            '_company' => 'text', '_phone' => 'text', '_headcount' => 'int',
            '_message' => 'text', '_source' => 'text',
        ],
    ];

    public function call(Request $request, string $name)
    {
        if (! isset(self::FUNCTIONS[$name])) {
            return response()->json(['error' => "RPC '$name' не зарегистрирован"], 404);
        }

        $signature = self::FUNCTIONS[$name];
        $payload = $request->input('params', $request->all());
        if (! is_array($payload)) {
            $payload = [];
        }

        $args = [];
        $placeholders = [];
        foreach ($signature as $param => $type) {
            $value = $payload[$param] ?? $payload[ltrim($param, '_')] ?? null;
            if (in_array($type, ['jsonb', 'json'], true) && $value !== null && ! is_string($value)) {
                $value = json_encode($value, JSON_UNESCAPED_UNICODE);
            }
            $args[] = $value;
            $placeholders[] = "?::{$type}";
        }

        $sql = sprintf('select public.%s(%s) as result', $name, implode(', ', $placeholders));

        try {
            // Propagate the authenticated user as auth.uid() inside SECURITY DEFINER funcs
            $userId = optional($request->user())->getAuthIdentifier();
            if ($userId) {
                DB::statement("select set_config('request.jwt.claim.sub', ?, true)", [(string) $userId]);
            }

            $rows = DB::select($sql, $args);
            $value = $rows[0]->result ?? null;
            if (is_string($value) && $value !== '' && in_array($value[0], ['{', '['], true)) {
                $decoded = json_decode($value, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $value = $decoded;
                }
            }
            return response()->json(['data' => $value]);
        } catch (Throwable $e) {
            $msg = self::localize($e->getMessage());
            return response()->json(['error' => $msg], 422);
        }
    }

    /** Map common Postgres errors to Russian per project memory. */
    protected static function localize(string $raw): string
    {
        if (preg_match('/violates row-level security/i', $raw)) {
            return 'Недостаточно прав для этой операции';
        }
        if (preg_match('/duplicate key value/i', $raw)) {
            return 'Запись с такими данными уже существует';
        }
        if (preg_match('/foreign key constraint/i', $raw)) {
            return 'Связанная запись не найдена';
        }
        // Postgres `RAISE EXCEPTION 'msg'` arrives as: SQLSTATE[P0001]: ... ERROR:  msg  CONTEXT: ...
        if (preg_match('/ERROR:\s*([^\n]+?)(?:\s+CONTEXT:|$)/u', $raw, $m)) {
            return trim($m[1]);
        }
        return 'Ошибка выполнения операции';
    }
}
