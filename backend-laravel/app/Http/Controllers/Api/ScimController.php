<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuthUserService;
use App\Services\SecurityAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Epic B3 — SCIM 2.0 (RFC 7644), минимальный профиль /Users.
 * Аутентификация — Bearer-токен из таблицы scim_tokens (не sanctum).
 *
 * Поддерживается: list с filter по userName, get, create, replace, patch (active), delete (soft).
 */
class ScimController extends Controller
{
    private const SCHEMA_USER = 'urn:ietf:params:scim:schemas:core:2.0:User';

    public function __construct(private AuthUserService $users) {}

    /** GET /api/scim/v2/ServiceProviderConfig */
    public function serviceProviderConfig(): JsonResponse
    {
        return $this->scim([
            'schemas' => ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
            'patch' => ['supported' => true],
            'bulk' => ['supported' => false, 'maxOperations' => 0, 'maxPayloadSize' => 0],
            'filter' => ['supported' => true, 'maxResults' => 200],
            'changePassword' => ['supported' => false],
            'sort' => ['supported' => false],
            'etag' => ['supported' => false],
            'authenticationSchemes' => [[
                'type' => 'oauthbearertoken',
                'name' => 'OAuth Bearer Token',
                'description' => 'SCIM-токен, выпущенный в разделе «Безопасность».',
            ]],
        ]);
    }

    /** GET /api/scim/v2/Users */
    public function index(Request $request): JsonResponse
    {
        $ctx = $this->auth($request);
        $count = min((int) $request->query('count', 100), 200);
        $start = max((int) $request->query('startIndex', 1), 1);

        $q = DB::table('profiles')->where('company_id', $ctx->company_id);
        if ($filter = (string) $request->query('filter', '')) {
            if (preg_match('/userName\s+eq\s+"([^"]+)"/i', $filter, $m)) {
                $email = strtolower($m[1]);
                $userId = DB::table('users')->where('email', $email)->value('id');
                $q->where('user_id', $userId ?: '__none__');
            }
        }

        $total = (clone $q)->count();
        $rows = $q->orderBy('created_at')->offset($start - 1)->limit($count)
            ->get(['user_id', 'full_name', 'is_active', 'company_id']);

        $emails = $rows->isNotEmpty()
            ? DB::table('users')->whereIn('id', $rows->pluck('user_id')->all())->pluck('email', 'id')
            : collect();

        return $this->scim([
            'schemas' => ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
            'totalResults' => $total,
            'startIndex' => $start,
            'itemsPerPage' => $rows->count(),
            'Resources' => $rows->map(fn ($r) => $this->toScim($r, $emails[$r->user_id] ?? null))->all(),
        ]);
    }

    /** GET /api/scim/v2/Users/{id} */
    public function show(string $id, Request $request): JsonResponse
    {
        $ctx = $this->auth($request);
        $row = DB::table('profiles')->where('user_id', $id)->where('company_id', $ctx->company_id)->first();
        if (!$row) return $this->error(404, 'User not found');
        $email = DB::table('users')->where('id', $id)->value('email');
        return $this->scim($this->toScim($row, $email));
    }

    /** POST /api/scim/v2/Users */
    public function store(Request $request): JsonResponse
    {
        $ctx = $this->auth($request);
        $body = $request->json()->all();
        $email = strtolower((string) ($body['userName'] ?? ($body['emails'][0]['value'] ?? '')));
        if (!$email) return $this->error(400, 'userName is required');

        $existing = User::where('email', $email)->first();
        if ($existing) return $this->error(409, 'User already exists');

        $name = trim(($body['name']['givenName'] ?? '') . ' ' . ($body['name']['familyName'] ?? ''));
        if (!$name) $name = (string) ($body['displayName'] ?? $email);

        $user = $this->users->createWithPassword($email, Str::random(40), $name, 'employee', $ctx->company_id, true);

        SecurityAudit::log([
            'company_id' => $ctx->company_id, 'user_id' => $user->id, 'actor_email' => $email,
            'event' => 'scim.user.created', 'category' => 'admin', 'severity' => 'warning',
            'target_type' => 'user', 'target_id' => (string) $user->id,
        ]);

        $row = DB::table('profiles')->where('user_id', $user->domainUserId())->first();
        return $this->scim($this->toScim($row ?: (object) ['user_id' => $user->id, 'full_name' => $name, 'is_active' => 1], $email), 201);
    }

    /** PUT /api/scim/v2/Users/{id} */
    public function replace(string $id, Request $request): JsonResponse
    {
        $ctx = $this->auth($request);
        $row = DB::table('profiles')->where('user_id', $id)->where('company_id', $ctx->company_id)->first();
        if (!$row) return $this->error(404, 'User not found');

        $body = $request->json()->all();
        $patch = ['updated_at' => now()];
        $name = trim(($body['name']['givenName'] ?? '') . ' ' . ($body['name']['familyName'] ?? ''));
        if (!$name) $name = (string) ($body['displayName'] ?? '');
        if ($name) $patch['full_name'] = $name;
        if (array_key_exists('active', $body)) $patch['is_active'] = (bool) $body['active'];

        DB::table('profiles')->where('user_id', $id)->update($patch);
        $this->audit($ctx, $id, 'scim.user.updated');

        $fresh = DB::table('profiles')->where('user_id', $id)->first();
        return $this->scim($this->toScim($fresh, DB::table('users')->where('id', $id)->value('email')));
    }

    /** PATCH /api/scim/v2/Users/{id} — поддержан replace active/displayName. */
    public function patch(string $id, Request $request): JsonResponse
    {
        $ctx = $this->auth($request);
        $row = DB::table('profiles')->where('user_id', $id)->where('company_id', $ctx->company_id)->first();
        if (!$row) return $this->error(404, 'User not found');

        $ops = $request->json('Operations') ?: [];
        $patch = ['updated_at' => now()];
        foreach ($ops as $op) {
            $path = strtolower((string) ($op['path'] ?? ''));
            $value = $op['value'] ?? null;
            if (strtolower((string) ($op['op'] ?? '')) === 'remove' && $path === 'active') {
                $patch['is_active'] = false;
                continue;
            }
            if ($path === 'active') {
                $patch['is_active'] = filter_var(is_array($value) ? reset($value) : $value, FILTER_VALIDATE_BOOLEAN);
            } elseif ($path === 'displayname' && is_string($value)) {
                $patch['full_name'] = $value;
            } elseif (!$path && is_array($value)) {
                if (array_key_exists('active', $value)) $patch['is_active'] = (bool) $value['active'];
                if (!empty($value['displayName'])) $patch['full_name'] = (string) $value['displayName'];
            }
        }

        DB::table('profiles')->where('user_id', $id)->update($patch);
        $this->audit($ctx, $id, 'scim.user.patched');

        $fresh = DB::table('profiles')->where('user_id', $id)->first();
        return $this->scim($this->toScim($fresh, DB::table('users')->where('id', $id)->value('email')));
    }

    /** DELETE /api/scim/v2/Users/{id} — деактивация (данные сохраняются). */
    public function destroy(string $id, Request $request): JsonResponse
    {
        $ctx = $this->auth($request);
        $row = DB::table('profiles')->where('user_id', $id)->where('company_id', $ctx->company_id)->first();
        if (!$row) return $this->error(404, 'User not found');

        DB::table('profiles')->where('user_id', $id)->update(['is_active' => false, 'updated_at' => now()]);
        $this->audit($ctx, $id, 'scim.user.deactivated', 'critical');

        return response()->json(null, 204);
    }

    // ---------- helpers ----------

    private function auth(Request $request): object
    {
        $header = (string) $request->header('Authorization', '');
        $plain = Str::startsWith($header, 'Bearer ') ? substr($header, 7) : '';
        if (!$plain) abort(response()->json(['detail' => 'Unauthorized'], 401));

        $row = DB::table('scim_tokens')
            ->where('token_hash', hash('sha256', $plain))
            ->where('is_active', true)
            ->first(['id', 'company_id']);
        if (!$row) abort(response()->json(['detail' => 'Unauthorized'], 401));

        DB::table('scim_tokens')->where('id', $row->id)->update(['last_used_at' => now()]);
        return $row;
    }

    private function toScim(object $row, ?string $email): array
    {
        return [
            'schemas' => [self::SCHEMA_USER],
            'id' => (string) $row->user_id,
            'userName' => $email,
            'displayName' => $row->full_name ?? null,
            'active' => (bool) ($row->is_active ?? true),
            'emails' => $email ? [['value' => $email, 'primary' => true]] : [],
            'meta' => ['resourceType' => 'User'],
        ];
    }

    private function audit(object $ctx, string $userId, string $event, string $severity = 'warning'): void
    {
        SecurityAudit::log([
            'company_id' => $ctx->company_id, 'user_id' => $userId, 'event' => $event,
            'category' => 'admin', 'severity' => $severity, 'target_type' => 'user', 'target_id' => $userId,
        ]);
    }

    private function scim(array $body, int $status = 200): JsonResponse
    {
        return response()->json($body, $status, ['Content-Type' => 'application/scim+json']);
    }

    private function error(int $status, string $detail): JsonResponse
    {
        return response()->json([
            'schemas' => ['urn:ietf:params:scim:api:messages:2.0:Error'],
            'detail' => $detail,
            'status' => (string) $status,
        ], $status);
    }
}
