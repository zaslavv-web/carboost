<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Integration\ResourceRegistry;
use App\Models\ApiKey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Управление машинными ключами компании (раздел «Интеграции»).
 *
 * Полный токен возвращается ровно один раз — при создании. В базе остаётся
 * только хеш, поэтому «показать ключ ещё раз» невозможно by design.
 */
class ApiKeyController extends Controller
{
    public function scopes(): JsonResponse
    {
        return response()->json([
            'scopes' => ResourceRegistry::scopes(),
            'events' => ResourceRegistry::events(),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $rows = ApiKey::query()
            ->where('company_id', $this->companyId($request))
            ->orderByDesc('created_at')
            ->get();

        return response()->json($rows);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $data = $request->validate([
            'name'           => 'required|string|max:160',
            'scopes'         => 'required|array|min:1',
            'scopes.*'       => 'string|max:64',
            'expires_at'     => 'nullable|date',
            'ip_allowlist'   => 'nullable|array',
            'ip_allowlist.*' => 'string|max:64',
        ]);

        $known = ResourceRegistry::scopes();
        $unknown = array_values(array_diff($data['scopes'], [...$known, '*']));
        if ($unknown !== []) {
            return response()->json([
                'error'   => 'unknown_scope',
                'message' => 'Неизвестные скоупы: ' . implode(', ', $unknown),
            ], 422);
        }

        $prefix = $this->uniquePrefix();
        $secret = Str::random(48);

        $key = ApiKey::create([
            'company_id'   => $this->companyId($request),
            'name'         => $data['name'],
            'prefix'       => $prefix,
            'token_hash'   => hash('sha256', $secret),
            'scopes'       => $data['scopes'],
            'ip_allowlist' => $data['ip_allowlist'] ?? null,
            'expires_at'   => $data['expires_at'] ?? null,
            'created_by'   => $request->user()->getAuthIdentifier(),
        ]);

        return response()->json(
            $key->toArray() + ['token' => "gp_{$prefix}_{$secret}"],
            201,
        );
    }

    public function revoke(Request $request, string $id): JsonResponse
    {
        $this->authorizeAdmin($request);

        $key = ApiKey::query()
            ->where('company_id', $this->companyId($request))
            ->findOrFail($id);

        $key->forceFill(['revoked_at' => now()])->save();

        return response()->json(['ok' => true]);
    }

    private function uniquePrefix(): string
    {
        do {
            $prefix = Str::lower(Str::random(12));
        } while (ApiKey::query()->where('prefix', $prefix)->exists());

        return $prefix;
    }

    private function companyId(Request $request): string
    {
        $user = $request->user();
        $companyId = method_exists($user, 'companyId') ? $user->companyId() : null;
        abort_unless($companyId, 422, 'У пользователя не задана компания');

        return (string) $companyId;
    }

    private function authorizeAdmin(Request $request): void
    {
        $user = $request->user();
        $allowed = $user && ($user->hasRole('company_admin') || $user->hasRole('superadmin'));
        abort_unless($allowed, 403, 'Ключами интеграций управляет администратор компании');
    }
}
