<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Integration\ResourceRegistry;
use App\Models\ApiKey;
use App\Models\Company;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Управление машинными ключами компании (раздел «Интеграции»).
 *
 * Полный токен возвращается ровно один раз — при создании. В базе остаётся
 * только хеш, поэтому «показать ключ ещё раз» невозможно by design.
 *
 * Ключ всегда принадлежит одной компании, и эта привязка определяет, какие
 * данные он увидит. Администратор компании работает только со своей;
 * суперадмин выбирает компанию явно — своей у него, как правило, нет.
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

    /**
     * Компании, для которых текущий пользователь может выпускать ключи.
     *
     * Обычному администратору возвращаем только его компанию — чтобы UI не
     * показывал выбор там, где выбора нет.
     */
    public function companies(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $query = Company::query()->withoutGlobalScopes()->orderBy('name');
        if (!$this->isSuperadmin($request)) {
            $query->where('id', $this->ownCompanyId($request));
        }

        return response()->json([
            'is_superadmin' => $this->isSuperadmin($request),
            'companies'     => $query->get(['id', 'name']),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $query = ApiKey::query()->orderByDesc('created_at');

        if ($this->isSuperadmin($request)) {
            // Суперадмин видит ключи всех компаний; фильтр — по желанию.
            if (($companyId = $request->query('company_id')) !== null && $companyId !== '') {
                $query->where('company_id', $companyId);
            }
        } else {
            $query->where('company_id', $this->ownCompanyId($request));
        }

        $rows = $query->get();

        // Название компании подмешиваем одним запросом: без него список ключей
        // суперадмина — это набор UUID, по которому ничего не понять.
        $names = Company::query()
            ->withoutGlobalScopes()
            ->whereIn('id', $rows->pluck('company_id')->unique()->all())
            ->pluck('name', 'id');

        return response()->json(
            $rows->map(fn (ApiKey $key) => $key->toArray() + [
                'company_name' => $names[$key->company_id] ?? null,
            ])->values()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $data = $request->validate([
            'name'           => 'required|string|max:160',
            'scopes'         => 'required|array|min:1',
            'scopes.*'       => 'string|max:64',
            'company_id'     => 'nullable|string|max:64',
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

        $companyId = $this->resolveTargetCompany($request, $data['company_id'] ?? null);
        if ($companyId instanceof JsonResponse) {
            return $companyId;
        }

        $prefix = $this->uniquePrefix();
        $secret = Str::random(48);

        $key = ApiKey::create([
            'company_id'   => $companyId,
            'name'         => $data['name'],
            'prefix'       => $prefix,
            'token_hash'   => hash('sha256', $secret),
            'scopes'       => $data['scopes'],
            'ip_allowlist' => $data['ip_allowlist'] ?? null,
            'expires_at'   => $data['expires_at'] ?? null,
            'created_by'   => $request->user()->getAuthIdentifier(),
        ]);

        return response()->json(
            $key->toArray() + [
                'token'        => "gp_{$prefix}_{$secret}",
                'company_name' => Company::query()->withoutGlobalScopes()->find($companyId)?->name,
            ],
            201,
        );
    }

    public function revoke(Request $request, string $id): JsonResponse
    {
        $this->authorizeAdmin($request);

        $query = ApiKey::query();
        if (!$this->isSuperadmin($request)) {
            $query->where('company_id', $this->ownCompanyId($request));
        }

        $key = $query->findOrFail($id);
        $key->forceFill(['revoked_at' => now()])->save();

        return response()->json(['ok' => true]);
    }

    // ---------------------------------------------------------------- helpers

    /**
     * Компания будущего ключа.
     *
     * @return string|JsonResponse Идентификатор компании либо готовый отказ.
     */
    private function resolveTargetCompany(Request $request, ?string $requested)
    {
        $own = $request->user()->companyId();

        // Компания не указана — берём свою. У суперадмина её обычно нет,
        // поэтому он обязан выбрать явно, а не получить непонятный отказ.
        if ($requested === null || $requested === '') {
            if ($own) {
                return (string) $own;
            }

            return response()->json([
                'error'   => 'company_required',
                'message' => 'Выберите компанию, для которой выпускается ключ',
            ], 422);
        }

        // Чужую компанию может указать только суперадмин: иначе администратор
        // одной компании выпустил бы ключ к данным другой.
        if (!$this->isSuperadmin($request) && $requested !== (string) $own) {
            return response()->json([
                'error'   => 'forbidden_company',
                'message' => 'Ключ можно выпустить только для своей компании',
            ], 403);
        }

        if (!Company::query()->withoutGlobalScopes()->whereKey($requested)->exists()) {
            return response()->json([
                'error'   => 'unknown_company',
                'message' => 'Компания не найдена',
            ], 422);
        }

        return $requested;
    }

    private function uniquePrefix(): string
    {
        do {
            $prefix = Str::lower(Str::random(12));
        } while (ApiKey::query()->where('prefix', $prefix)->exists());

        return $prefix;
    }

    private function isSuperadmin(Request $request): bool
    {
        $user = $request->user();

        return $user !== null && $user->hasRole('superadmin');
    }

    /** Компания текущего пользователя; для действий, где она обязательна. */
    private function ownCompanyId(Request $request): string
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
