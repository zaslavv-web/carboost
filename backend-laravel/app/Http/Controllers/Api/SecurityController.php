<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SecurityAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Epic B3 — SSO и корпоративная безопасность:
 * провайдеры SAML/OIDC, SCIM-токены, политики доступа, аудит-лог, кастомные RBAC-роли.
 *
 * Только raw DB::table, без Eloquent-гидрации.
 */
class SecurityController extends Controller
{
    private const LIST_LIMIT = 200;

    /** Каталог прав для конструктора кастомных ролей. */
    public const PERMISSIONS = [
        'employees.read', 'employees.write',
        'positions.read', 'positions.write',
        'documents.read', 'documents.sign', 'documents.manage',
        'courses.read', 'courses.manage',
        'analytics.read', 'analytics.export',
        'performance.read', 'performance.manage',
        'okr.read', 'okr.manage',
        'surveys.read', 'surveys.manage',
        'leaves.read', 'leaves.approve',
        'security.read', 'security.manage',
        'integrations.manage',
    ];

    // ======================= Обзор =======================

    public function stats(Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $companyId = $this->companyId($request);

        $since = now()->subDays(30);
        $events = DB::table('security_audit_log')
            ->where('company_id', $companyId)
            ->where('created_at', '>=', $since)
            ->selectRaw('severity, count(*) as c')
            ->groupBy('severity')
            ->pluck('c', 'severity');

        $usersTotal = DB::table('profiles')->where('company_id', $companyId)->count();
        $userIds = DB::table('profiles')->where('company_id', $companyId)->limit(5000)->pluck('user_id')->all();
        $with2fa = $userIds
            ? DB::table('user_two_factor')->whereIn('user_id', $userIds)->where('enabled', true)->count()
            : 0;

        return response()->json([
            'providers'   => DB::table('sso_providers')->where('company_id', $companyId)->count(),
            'scim_tokens' => DB::table('scim_tokens')->where('company_id', $companyId)->where('is_active', true)->count(),
            'roles'       => DB::table('custom_roles')->where('company_id', $companyId)->count(),
            'events_30d'  => (int) array_sum($events->all()),
            'by_severity' => $events,
            'users_total' => $usersTotal,
            'users_2fa'   => $with2fa,
            'permissions' => self::PERMISSIONS,
        ]);
    }

    // ======================= SSO-провайдеры =======================

    public function indexProviders(Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $rows = DB::table('sso_providers')
            ->where('company_id', $this->companyId($request))
            ->orderBy('created_at')
            ->limit(self::LIST_LIMIT)
            ->get([
                'id', 'kind', 'title', 'domain_hint', 'is_active', 'jit_provisioning', 'default_role',
                'entity_id', 'sso_url', 'slo_url', 'issuer', 'authorize_url', 'token_url', 'userinfo_url',
                'client_id', 'scopes', 'last_login_at', 'created_at',
            ]);

        $base = rtrim(config('app.url') ?: url('/'), '/');
        return response()->json([
            'data' => $rows,
            'endpoints' => [
                'acs'         => $base . '/api/sso/{id}/acs',
                'metadata'    => $base . '/api/sso/{id}/metadata',
                'oidc_return' => $base . '/api/sso/{id}/callback',
                'entity_id'   => $base . '/api/sso/{id}/metadata',
            ],
        ]);
    }

    public function storeProvider(Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $data = $this->providerRules($request);
        $companyId = $this->companyId($request);
        if (!$companyId) return response()->json(['ok' => false, 'message' => 'Не указана компания.'], 422);

        $id = (string) Str::uuid();
        DB::table('sso_providers')->insert(array_merge($this->providerRow($data), [
            'id'         => $id,
            'company_id' => $companyId,
            'created_by' => $this->userId($request),
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        SecurityAudit::log([
            'company_id' => $companyId, 'user_id' => $this->userId($request),
            'actor_email' => $request->user()?->email, 'event' => 'sso.provider.created',
            'category' => 'admin', 'severity' => 'warning', 'target_type' => 'sso_provider', 'target_id' => $id,
            'payload' => ['kind' => $data['kind'] ?? 'oidc', 'title' => $data['title']],
        ]);

        return response()->json(['ok' => true, 'id' => $id]);
    }

    public function updateProvider(string $id, Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $row = $this->ownedRow('sso_providers', $id, $request);
        $data = $this->providerRules($request, false);

        $patch = $this->providerRow($data, true);
        if ($patch) {
            $patch['updated_at'] = now();
            DB::table('sso_providers')->where('id', $row->id)->update($patch);
        }

        SecurityAudit::log([
            'company_id' => $row->company_id, 'user_id' => $this->userId($request),
            'actor_email' => $request->user()?->email, 'event' => 'sso.provider.updated',
            'category' => 'admin', 'severity' => 'warning', 'target_type' => 'sso_provider', 'target_id' => $id,
        ]);
        return response()->json(['ok' => true]);
    }

    public function destroyProvider(string $id, Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $row = $this->ownedRow('sso_providers', $id, $request);
        DB::table('sso_providers')->where('id', $row->id)->delete();

        SecurityAudit::log([
            'company_id' => $row->company_id, 'user_id' => $this->userId($request),
            'actor_email' => $request->user()?->email, 'event' => 'sso.provider.deleted',
            'category' => 'admin', 'severity' => 'critical', 'target_type' => 'sso_provider', 'target_id' => $id,
        ]);
        return response()->json(['ok' => true]);
    }

    private function providerRules(Request $request, bool $required = true): array
    {
        return $request->validate([
            'kind'             => ($required ? 'required' : 'sometimes') . '|in:saml,oidc',
            'title'            => ($required ? 'required' : 'sometimes') . '|string|max:200',
            'domain_hint'      => 'nullable|string|max:190',
            'is_active'        => 'sometimes|boolean',
            'jit_provisioning' => 'sometimes|boolean',
            'default_role'     => 'sometimes|in:employee,manager,hr,hrd,company_admin',
            'entity_id'        => 'nullable|string|max:500',
            'sso_url'          => 'nullable|string|max:500',
            'slo_url'          => 'nullable|string|max:500',
            'x509_cert'        => 'nullable|string',
            'issuer'           => 'nullable|string|max:500',
            'authorize_url'    => 'nullable|string|max:500',
            'token_url'        => 'nullable|string|max:500',
            'userinfo_url'     => 'nullable|string|max:500',
            'client_id'        => 'nullable|string|max:300',
            'client_secret'    => 'nullable|string|max:500',
            'scopes'           => 'nullable|string|max:300',
        ]);
    }

    private function providerRow(array $data, bool $patch = false): array
    {
        $fields = ['kind', 'title', 'domain_hint', 'is_active', 'jit_provisioning', 'default_role',
                   'entity_id', 'sso_url', 'slo_url', 'x509_cert', 'issuer', 'authorize_url', 'token_url',
                   'userinfo_url', 'client_id', 'client_secret', 'scopes'];
        $row = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $data)) $row[$f] = $data[$f];
        }
        if (!$patch) {
            $row['kind'] = $row['kind'] ?? 'oidc';
            $row['title'] = $row['title'] ?? 'SSO';
            $row['is_active'] = $row['is_active'] ?? true;
            $row['jit_provisioning'] = $row['jit_provisioning'] ?? true;
            $row['default_role'] = $row['default_role'] ?? 'employee';
            $row['scopes'] = $row['scopes'] ?? 'openid email profile';
        }
        return $row;
    }

    // ======================= SCIM-токены =======================

    public function indexScimTokens(Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $rows = DB::table('scim_tokens')
            ->where('company_id', $this->companyId($request))
            ->orderByDesc('created_at')
            ->limit(self::LIST_LIMIT)
            ->get(['id', 'name', 'token_prefix', 'is_active', 'last_used_at', 'created_at']);

        $base = rtrim(config('app.url') ?: url('/'), '/');
        return response()->json(['data' => $rows, 'base_url' => $base . '/api/scim/v2']);
    }

    public function storeScimToken(Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $data = $request->validate(['name' => 'required|string|max:200']);
        $companyId = $this->companyId($request);
        if (!$companyId) return response()->json(['ok' => false, 'message' => 'Не указана компания.'], 422);

        $plain = 'scim_' . Str::random(48);
        $id = (string) Str::uuid();
        DB::table('scim_tokens')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'name' => $data['name'],
            'token_hash' => hash('sha256', $plain),
            'token_prefix' => substr($plain, 0, 12),
            'is_active' => true,
            'created_by' => $this->userId($request),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        SecurityAudit::log([
            'company_id' => $companyId, 'user_id' => $this->userId($request),
            'actor_email' => $request->user()?->email, 'event' => 'scim.token.created',
            'category' => 'admin', 'severity' => 'critical', 'target_type' => 'scim_token', 'target_id' => $id,
        ]);

        // Полный токен показывается один раз.
        return response()->json(['ok' => true, 'id' => $id, 'token' => $plain]);
    }

    public function destroyScimToken(string $id, Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $row = $this->ownedRow('scim_tokens', $id, $request);
        DB::table('scim_tokens')->where('id', $row->id)->update(['is_active' => false, 'updated_at' => now()]);

        SecurityAudit::log([
            'company_id' => $row->company_id, 'user_id' => $this->userId($request),
            'actor_email' => $request->user()?->email, 'event' => 'scim.token.revoked',
            'category' => 'admin', 'severity' => 'critical', 'target_type' => 'scim_token', 'target_id' => $id,
        ]);
        return response()->json(['ok' => true]);
    }

    // ======================= Политики доступа =======================

    public function showPolicy(Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $companyId = $this->companyId($request);
        $row = DB::table('security_policies')->where('company_id', $companyId)->first();

        return response()->json([
            'require_2fa_roles'       => $row ? json_decode($row->require_2fa_roles ?? '[]', true) : [],
            'ip_allowlist'            => $row ? json_decode($row->ip_allowlist ?? '[]', true) : [],
            'session_timeout_minutes' => $row->session_timeout_minutes ?? 0,
            'password_min_length'     => $row->password_min_length ?? 8,
            'sso_only'                => (bool) ($row->sso_only ?? false),
            'siem_webhook_url'        => $row->siem_webhook_url ?? null,
            'siem_format'             => $row->siem_format ?? 'json',
        ]);
    }

    public function updatePolicy(Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'require_2fa_roles'       => 'sometimes|array',
            'require_2fa_roles.*'     => 'string|max:32',
            'ip_allowlist'            => 'sometimes|array',
            'ip_allowlist.*'          => 'string|max:64',
            'session_timeout_minutes' => 'sometimes|integer|min:0|max:10080',
            'password_min_length'     => 'sometimes|integer|min:6|max:64',
            'sso_only'                => 'sometimes|boolean',
            'siem_webhook_url'        => 'nullable|string|max:500',
            'siem_format'             => 'sometimes|in:json,cef',
        ]);
        $companyId = $this->companyId($request);
        if (!$companyId) return response()->json(['ok' => false, 'message' => 'Не указана компания.'], 422);

        $patch = ['updated_at' => now()];
        if (array_key_exists('require_2fa_roles', $data)) $patch['require_2fa_roles'] = json_encode(array_values($data['require_2fa_roles']));
        if (array_key_exists('ip_allowlist', $data))      $patch['ip_allowlist'] = json_encode(array_values($data['ip_allowlist']));
        foreach (['session_timeout_minutes', 'password_min_length', 'sso_only', 'siem_webhook_url', 'siem_format'] as $f) {
            if (array_key_exists($f, $data)) $patch[$f] = $data[$f];
        }

        $exists = DB::table('security_policies')->where('company_id', $companyId)->exists();
        if ($exists) {
            DB::table('security_policies')->where('company_id', $companyId)->update($patch);
        } else {
            DB::table('security_policies')->insert(array_merge([
                'id' => (string) Str::uuid(), 'company_id' => $companyId, 'created_at' => now(),
            ], $patch));
        }

        SecurityAudit::log([
            'company_id' => $companyId, 'user_id' => $this->userId($request),
            'actor_email' => $request->user()?->email, 'event' => 'security.policy.updated',
            'category' => 'admin', 'severity' => 'critical', 'payload' => array_keys($patch),
        ]);
        return response()->json(['ok' => true]);
    }

    // ======================= Аудит-лог =======================

    public function indexAudit(Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $q = $this->auditQuery($request);
        $rows = $q->orderByDesc('created_at')->limit(min((int) $request->query('limit', 200), 500))->get([
            'id', 'user_id', 'actor_email', 'event', 'category', 'severity',
            'target_type', 'target_id', 'ip', 'created_at',
        ]);
        return response()->json(['data' => $rows]);
    }

    /** Экспорт для SIEM: CSV, JSON Lines или CEF. */
    public function exportAudit(Request $request): StreamedResponse
    {
        $this->assertAdmin($request);
        $format = in_array($request->query('format'), ['csv', 'jsonl', 'cef'], true) ? $request->query('format') : 'csv';
        $query = $this->auditQuery($request)->orderByDesc('created_at');
        $filename = 'audit-' . now()->format('Ymd-His') . '.' . ($format === 'cef' ? 'log' : $format);

        $mime = ['csv' => 'text/csv', 'jsonl' => 'application/x-ndjson', 'cef' => 'text/plain'][$format];

        return response()->streamDownload(function () use ($query, $format) {
            $out = fopen('php://output', 'w');
            if ($format === 'csv') {
                fputcsv($out, ['created_at', 'event', 'category', 'severity', 'actor_email', 'user_id', 'ip', 'target_type', 'target_id', 'payload']);
            }
            $query->chunk(500, function ($chunk) use ($out, $format) {
                foreach ($chunk as $r) {
                    $row = (array) $r;
                    if ($format === 'csv') {
                        fputcsv($out, [$r->created_at, $r->event, $r->category, $r->severity, $r->actor_email,
                                       $r->user_id, $r->ip, $r->target_type, $r->target_id, $r->payload]);
                    } elseif ($format === 'jsonl') {
                        fwrite($out, json_encode($row, JSON_UNESCAPED_UNICODE) . "\n");
                    } else {
                        fwrite($out, SecurityAudit::toCef($row) . "\n");
                    }
                }
                flush();
            });
            fclose($out);
        }, $filename, ['Content-Type' => $mime]);
    }

    private function auditQuery(Request $request)
    {
        $q = DB::table('security_audit_log')->where('company_id', $this->companyId($request));
        if ($v = $request->query('event'))    $q->where('event', $v);
        if ($v = $request->query('category')) $q->where('category', $v);
        if ($v = $request->query('severity')) $q->where('severity', $v);
        if ($v = $request->query('user_id'))  $q->where('user_id', $v);
        if ($v = $request->query('from'))     $q->where('created_at', '>=', $v);
        if ($v = $request->query('to'))       $q->where('created_at', '<=', $v);
        if ($v = $request->query('search'))   $q->where('actor_email', 'like', '%' . $v . '%');
        return $q;
    }

    // ======================= Кастомные роли (RBAC) =======================

    public function indexRoles(Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $companyId = $this->companyId($request);
        $roles = DB::table('custom_roles')
            ->where('company_id', $companyId)
            ->orderBy('title')->limit(self::LIST_LIMIT)
            ->get(['id', 'code', 'title', 'description', 'base_role', 'permissions', 'is_active', 'updated_at']);

        $counts = DB::table('custom_role_user')
            ->where('company_id', $companyId)
            ->selectRaw('custom_role_id, count(*) as c')
            ->groupBy('custom_role_id')
            ->pluck('c', 'custom_role_id');

        $data = $roles->map(function ($r) use ($counts) {
            $r->permissions = json_decode($r->permissions ?? '[]', true) ?: [];
            $r->members = (int) ($counts[$r->id] ?? 0);
            return $r;
        });

        return response()->json(['data' => $data, 'permissions' => self::PERMISSIONS]);
    }

    public function storeRole(Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'title'         => 'required|string|max:200',
            'code'          => 'nullable|string|max:64',
            'description'   => 'nullable|string|max:500',
            'base_role'     => 'sometimes|in:employee,manager,hr,hrd,company_admin',
            'permissions'   => 'sometimes|array',
            'permissions.*' => 'string|max:64',
        ]);
        $companyId = $this->companyId($request);
        if (!$companyId) return response()->json(['ok' => false, 'message' => 'Не указана компания.'], 422);

        $id = (string) Str::uuid();
        DB::table('custom_roles')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'code' => $data['code'] ?? Str::slug($data['title'], '_') ?: ('role_' . substr($id, 0, 6)),
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'base_role' => $data['base_role'] ?? 'employee',
            'permissions' => json_encode(array_values($data['permissions'] ?? []), JSON_UNESCAPED_UNICODE),
            'is_active' => true,
            'created_by' => $this->userId($request),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        SecurityAudit::log([
            'company_id' => $companyId, 'user_id' => $this->userId($request),
            'actor_email' => $request->user()?->email, 'event' => 'rbac.role.created',
            'category' => 'admin', 'severity' => 'warning', 'target_type' => 'custom_role', 'target_id' => $id,
        ]);
        return response()->json(['ok' => true, 'id' => $id]);
    }

    public function updateRole(string $id, Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $row = $this->ownedRow('custom_roles', $id, $request);
        $data = $request->validate([
            'title'         => 'sometimes|string|max:200',
            'description'   => 'nullable|string|max:500',
            'base_role'     => 'sometimes|in:employee,manager,hr,hrd,company_admin',
            'permissions'   => 'sometimes|array',
            'permissions.*' => 'string|max:64',
            'is_active'     => 'sometimes|boolean',
        ]);

        $patch = ['updated_at' => now()];
        foreach (['title', 'description', 'base_role', 'is_active'] as $f) {
            if (array_key_exists($f, $data)) $patch[$f] = $data[$f];
        }
        if (array_key_exists('permissions', $data)) {
            $patch['permissions'] = json_encode(array_values($data['permissions']), JSON_UNESCAPED_UNICODE);
        }
        DB::table('custom_roles')->where('id', $row->id)->update($patch);

        SecurityAudit::log([
            'company_id' => $row->company_id, 'user_id' => $this->userId($request),
            'actor_email' => $request->user()?->email, 'event' => 'rbac.role.updated',
            'category' => 'admin', 'severity' => 'warning', 'target_type' => 'custom_role', 'target_id' => $id,
        ]);
        return response()->json(['ok' => true]);
    }

    public function destroyRole(string $id, Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $row = $this->ownedRow('custom_roles', $id, $request);
        DB::table('custom_role_user')->where('custom_role_id', $row->id)->delete();
        DB::table('custom_roles')->where('id', $row->id)->delete();

        SecurityAudit::log([
            'company_id' => $row->company_id, 'user_id' => $this->userId($request),
            'actor_email' => $request->user()?->email, 'event' => 'rbac.role.deleted',
            'category' => 'admin', 'severity' => 'critical', 'target_type' => 'custom_role', 'target_id' => $id,
        ]);
        return response()->json(['ok' => true]);
    }

    public function roleMembers(string $id, Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $row = $this->ownedRow('custom_roles', $id, $request);
        $links = DB::table('custom_role_user')->where('custom_role_id', $row->id)->limit(1000)->get(['id', 'user_id', 'created_at']);
        $ids = $links->pluck('user_id')->all();
        $names = $ids
            ? DB::table('profiles')->whereIn('user_id', $ids)->pluck('full_name', 'user_id')
            : collect();

        return response()->json([
            'data' => $links->map(function ($l) use ($names) {
                $l->name = $names[$l->user_id] ?? null;
                return $l;
            }),
        ]);
    }

    public function assignRole(string $id, Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $row = $this->ownedRow('custom_roles', $id, $request);
        $data = $request->validate([
            'user_ids'   => 'required|array|min:1|max:500',
            'user_ids.*' => 'string|max:64',
        ]);

        $added = 0;
        foreach ($data['user_ids'] as $uid) {
            $exists = DB::table('custom_role_user')->where('custom_role_id', $row->id)->where('user_id', $uid)->exists();
            if ($exists) continue;
            DB::table('custom_role_user')->insert([
                'id' => (string) Str::uuid(),
                'company_id' => $row->company_id,
                'custom_role_id' => $row->id,
                'user_id' => (string) $uid,
                'assigned_by' => $this->userId($request),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $added++;
        }

        SecurityAudit::log([
            'company_id' => $row->company_id, 'user_id' => $this->userId($request),
            'actor_email' => $request->user()?->email, 'event' => 'rbac.role.assigned',
            'category' => 'admin', 'severity' => 'warning', 'target_type' => 'custom_role', 'target_id' => $id,
            'payload' => ['added' => $added],
        ]);
        return response()->json(['ok' => true, 'added' => $added]);
    }

    public function unassignRole(string $id, string $userId, Request $request): JsonResponse
    {
        $this->assertAdmin($request);
        $row = $this->ownedRow('custom_roles', $id, $request);
        DB::table('custom_role_user')->where('custom_role_id', $row->id)->where('user_id', $userId)->delete();

        SecurityAudit::log([
            'company_id' => $row->company_id, 'user_id' => $this->userId($request),
            'actor_email' => $request->user()?->email, 'event' => 'rbac.role.unassigned',
            'category' => 'admin', 'severity' => 'warning', 'target_type' => 'custom_role', 'target_id' => $id,
            'payload' => ['user_id' => $userId],
        ]);
        return response()->json(['ok' => true]);
    }

    // ======================= Helpers =======================

    private function ownedRow(string $table, string $id, Request $request): object
    {
        $row = DB::table($table)->where('id', $id)->first();
        if (!$row) abort(404);
        $companyId = $this->companyId($request);
        $isSuper = $this->isSuperadmin($request->user());
        if (!$isSuper && (string) ($row->company_id ?? '') !== (string) $companyId) abort(403);
        return $row;
    }

    private function assertAdmin(Request $request): void
    {
        $user = $request->user();
        $ok = false;
        try {
            $ok = $user && ($user->hasRole('company_admin') || $user->hasRole('superadmin') || $user->hasRole('hrd'));
        } catch (\Throwable) {
            $ok = false;
        }
        if (!$ok) abort(403);
    }

    private function isSuperadmin($user): bool
    {
        try {
            return (bool) $user?->hasRole('superadmin');
        } catch (\Throwable) {
            return false;
        }
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
