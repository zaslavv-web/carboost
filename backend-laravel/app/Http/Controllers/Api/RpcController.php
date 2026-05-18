<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CompanyRegistrationService;
use App\Services\InvitationService;
use App\Services\LeadService;
use App\Services\UserAdminService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * RPC bridge (заменяет supabase.rpc(name, params)).
 *
 * Batch 1 (PHP-native): verify_user, reject_user, delete_user, assign_role,
 * register_company, find_company_by_name, bulk_invite_employees,
 * submit_demo_request, submit_pricing_inquiry.
 *
 * Остальные функции (career steps, shop, gamification, questionnaire) пока
 * проксируются в Postgres SECURITY DEFINER — будут переписаны в Batch 2/3.
 */
class RpcController extends Controller
{
    /** Pure-PHP RPCs. Key = name, value = [auth?, callable($actor, $params)]. */
    private array $native;

    /** Legacy passthrough to Postgres: name => [param_name => sql_type]. */
    private const PG_FALLBACK = [
        'submit_employee_questionnaire' => [
            '_questionnaire_id' => 'uuid', '_position_id' => 'uuid',
            '_other_position_title' => 'text', '_answers' => 'jsonb',
            '_skill_gaps' => 'jsonb', '_status' => 'text',
        ],
        'submit_career_step'   => ['_assignment_id' => 'uuid', '_step_order' => 'int', '_payload' => 'jsonb'],
        'review_career_step'   => ['_submission_id' => 'uuid', '_approve' => 'bool', '_reason' => 'text'],
        'create_shop_order'    => ['_items' => 'jsonb'],
        'fulfill_shop_order'   => ['_order_id' => 'uuid', '_approve' => 'bool', '_reason' => 'text'],
        'award_currency'       => [
            '_user_id' => 'uuid', '_company_id' => 'uuid', '_amount' => 'int',
            '_kind' => 'text', '_description' => 'text', '_reference_id' => 'uuid',
        ],
    ];

    public function __construct(
        private UserAdminService $users,
        private CompanyRegistrationService $companies,
        private InvitationService $invites,
        private LeadService $leads,
    ) {
        $this->native = [
            'verify_user'           => fn($a, $p) => $this->users->verify($a, $p['_target_user_id'] ?? $p['target_user_id'] ?? ''),
            'reject_user'           => fn($a, $p) => $this->users->reject($a, $p['_target_user_id'] ?? $p['target_user_id'] ?? ''),
            'delete_user'           => fn($a, $p) => $this->users->delete($a, $p['_target_user_id'] ?? $p['target_user_id'] ?? ''),
            'assign_role'           => fn($a, $p) => $this->users->assignRole(
                $a,
                $p['_target_user_id'] ?? $p['target_user_id'] ?? '',
                $p['_role'] ?? $p['_new_role'] ?? $p['role'] ?? ''
            ),
            'register_company'      => fn($a, $p) => $this->companies->register($p['_name'] ?? $p['name'] ?? ''),
            'find_company_by_name'  => fn($a, $p) => $this->companies->findByName($p['_name'] ?? $p['name'] ?? ''),
            'bulk_invite_employees' => fn($a, $p) => $this->invites->bulkInvite($a, $p['_invites'] ?? $p['invites'] ?? []),
            'submit_demo_request'   => fn($_, $p) => $this->leads->submitDemo($this->stripUnderscore($p)),
            'submit_pricing_inquiry'=> fn($_, $p) => $this->leads->submitPricing($this->stripUnderscore($p)),
        ];
    }

    public function call(Request $request, string $name)
    {
        $payload = $request->input('params', $request->all());
        if (!is_array($payload)) $payload = [];

        // 1) Native PHP path
        if (isset($this->native[$name])) {
            try {
                $result = ($this->native[$name])($request->user(), $payload);
                return response()->json(['data' => $result]);
            } catch (Throwable $e) {
                return response()->json(['error' => $e->getMessage()], 422);
            }
        }

        // 2) Legacy Postgres passthrough (will shrink in Batch 2/3)
        if (!isset(self::PG_FALLBACK[$name])) {
            return response()->json(['error' => "RPC '$name' не зарегистрирован"], 404);
        }

        return $this->callPostgres($request, $name, $payload);
    }

    private function callPostgres(Request $request, string $name, array $payload)
    {
        $signature = self::PG_FALLBACK[$name];
        $args = [];
        $placeholders = [];
        foreach ($signature as $param => $type) {
            $value = $payload[$param] ?? $payload[ltrim($param, '_')] ?? null;
            if (in_array($type, ['jsonb', 'json'], true) && $value !== null && !is_string($value)) {
                $value = json_encode($value, JSON_UNESCAPED_UNICODE);
            }
            $args[] = $value;
            $placeholders[] = "?::{$type}";
        }
        $sql = sprintf('select public.%s(%s) as result', $name, implode(', ', $placeholders));

        try {
            $userId = optional($request->user())->getAuthIdentifier();
            if ($userId) {
                DB::statement("select set_config('request.jwt.claim.sub', ?, true)", [(string)$userId]);
            }
            $rows = DB::select($sql, $args);
            $value = $rows[0]->result ?? null;
            if (is_string($value) && $value !== '' && in_array($value[0], ['{', '['], true)) {
                $decoded = json_decode($value, true);
                if (json_last_error() === JSON_ERROR_NONE) $value = $decoded;
            }
            return response()->json(['data' => $value]);
        } catch (Throwable $e) {
            return response()->json(['error' => self::localize($e->getMessage())], 422);
        }
    }

    private function stripUnderscore(array $p): array
    {
        $out = [];
        foreach ($p as $k => $v) {
            $out[ltrim((string)$k, '_')] = $v;
        }
        return $out;
    }

    protected static function localize(string $raw): string
    {
        if (preg_match('/violates row-level security/i', $raw)) return 'Недостаточно прав для этой операции';
        if (preg_match('/duplicate key value/i', $raw)) return 'Запись с такими данными уже существует';
        if (preg_match('/foreign key constraint/i', $raw)) return 'Связанная запись не найдена';
        if (preg_match('/ERROR:\s*([^\n]+?)(?:\s+CONTEXT:|$)/u', $raw, $m)) return trim($m[1]);
        return 'Ошибка выполнения операции';
    }
}
