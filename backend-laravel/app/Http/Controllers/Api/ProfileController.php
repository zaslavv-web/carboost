<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Profile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Профили сотрудников. View/update делегируется ProfilePolicy.
 * Verify — отдельный action (соответствует RPC verify_user / Gate verify-users).
 */
class ProfileController extends Controller
{
    private const DIRECTORY_CHUNK_ROWS = 50;

    public function index(Request $request): JsonResponse
    {
        $stage = 'authorize';
        $queryCount = 0;
        $rowCount = 0;
        $request->attributes->set('profile_directory_stage', $stage);

        try {
            $this->authorize('viewAny', Profile::class);

            $stage = 'company_context';
            $request->attributes->set('profile_directory_stage', $stage);
            $user = $request->user();
            $isSuperadmin = $user && $user->hasRole('superadmin');
            $companyId = $isSuperadmin
                ? $request->string('company_id')->trim()->toString()
                : ($user?->companyId() ?? '');

            if (!$isSuperadmin && $companyId === '') {
                return response()->json([
                    'message' => 'У пользователя не указана компания',
                    'code' => 'company_missing',
                ], 422);
            }

            // Каталог читается сырыми порциями. Это сохраняет сортировку и формат,
            // но не держит одновременно 500 широких строк + роли в PDO/Collection.
            $baseQuery = DB::table('profiles as p')
                ->leftJoin('users as u', 'u.id', '=', 'p.user_id')
                ->select([
                    'p.id', 'p.user_id', 'p.full_name', 'p.position',
                    'p.position_id', 'p.pending_position_id', 'p.department',
                    'p.overall_score', 'p.role_readiness', 'p.is_verified',
                    'p.requested_role', 'p.company_id', 'p.avatar_url',
                    'p.hire_date', 'p.created_at', 'p.updated_at', 'u.email',
                ]);

            if ($companyId !== '') {
                $baseQuery->where('p.company_id', $companyId);
            }
            if ($request->boolean('unverified')) {
                $baseQuery->where('p.is_verified', false);
            }
            if ($search = trim((string) $request->get('search', ''))) {
                $like = '%' . $search . '%';
                $baseQuery->where(function ($q) use ($like) {
                    $q->where('p.full_name', 'like', $like)
                        ->orWhere('u.email', 'like', $like);
                });
            }

            $perPage = max(1, min((int) $request->get('per_page', 200), 500));
            $page = max(1, (int) $request->get('page', 1));
            $wanted = $perPage + 1;
            $baseOffset = ($page - 1) * $perPage;
            $data = [];

            for ($offset = 0; $offset < $wanted; $offset += self::DIRECTORY_CHUNK_ROWS) {
                $stage = 'profiles_chunk';
                $request->attributes->set('profile_directory_stage', $stage);
                $chunkSize = min(self::DIRECTORY_CHUNK_ROWS, $wanted - $offset);
                $rows = (clone $baseQuery)
                    ->orderBy('p.full_name')
                    ->orderBy('p.id')
                    ->offset($baseOffset + $offset)
                    ->limit($chunkSize)
                    ->get();
                $queryCount++;
                $rowCount += $rows->count();
                $request->attributes->set('profile_directory_rows', $rowCount);
                $request->attributes->set('profile_directory_queries', $queryCount);

                if ($rows->isEmpty()) {
                    break;
                }

                $stage = 'roles_chunk';
                $request->attributes->set('profile_directory_stage', $stage);
                $userIds = $rows->pluck('user_id')->filter()->unique()->values()->all();
                $rolesByUser = empty($userIds)
                    ? collect()
                    : DB::table('user_roles')
                        ->whereIn('user_id', $userIds)
                        ->get(['user_id', 'role'])
                        ->groupBy('user_id');
                if ($userIds) {
                    $queryCount++;
                    $request->attributes->set('profile_directory_queries', $queryCount);
                }

                foreach ($rows as $row) {
                    if (count($data) >= $wanted) {
                        break 2;
                    }
                    $item = (array) $row;
                    $item['is_verified'] = (bool) $item['is_verified'];
                    $item['roles'] = $rolesByUser->get($row->user_id, collect())
                        ->pluck('role')
                        ->map(fn ($role) => (string) $role)
                        ->values()
                        ->all();
                    $data[] = $item;
                }

                if ($rows->count() < $chunkSize) {
                    break;
                }
                unset($rows, $rolesByUser);
            }

            $stage = 'serialize';
            $request->attributes->set('profile_directory_stage', $stage);
            $hasMore = count($data) > $perPage;
            if ($hasMore) {
                array_pop($data);
            }

            return response()->json([
                'data' => $data,
                'current_page' => $page,
                'per_page' => $perPage,
                'has_more' => $hasMore,
            ])->header('X-Profile-Read-Path', 'raw-chunked-v2');
        } catch (\Illuminate\Database\QueryException $e) {
            if (preg_match('/max_user_connections|max_connections_per_hour|Too many connections|server has gone away|Connection refused/i', $e->getMessage())) {
                throw $e;
            }
            return $this->directoryError($request, $stage, $queryCount, $rowCount, $e);
        } catch (\Throwable $e) {
            return $this->directoryError($request, $stage, $queryCount, $rowCount, $e);
        }
    }

    private function directoryError(Request $request, string $stage, int $queryCount, int $rowCount, \Throwable $e): JsonResponse
    {
        $errorId = substr(bin2hex(random_bytes(4)), 0, 8);
        \Log::error('profile_directory_failed', [
            'error_id' => $errorId,
            'stage' => $stage,
            'queries' => $queryCount,
            'rows' => $rowCount,
            'user' => optional($request->user())->getAuthIdentifier(),
            'message' => $e->getMessage(),
            'where' => $e->getFile() . ':' . $e->getLine(),
            'usage_mb' => round(memory_get_usage(true) / 1048576, 1),
            'usage_php_mb' => round(memory_get_usage(false) / 1048576, 1),
            'peak_mb' => round(memory_get_peak_usage(true) / 1048576, 1),
            'peak_php_mb' => round(memory_get_peak_usage(false) / 1048576, 1),
            'limit' => ini_get('memory_limit'),
        ]);

        return response()->json([
            'message' => 'Не удалось загрузить каталог сотрудников',
            'code' => 'profile_directory_failed',
            'error_id' => $errorId,
            'stage' => $stage,
        ], 500);
    }

    public function show(string $id): JsonResponse
    {
        $query = Profile::with(['user', 'company']);

        // Если $id — UUID, ищем по primary key (старый контракт),
        // иначе считаем это user_id (новый фронт-контракт useLaravelProfile).
        $isUuid = (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id);
        $profile = $isUuid
            ? $query->where('id', $id)->orWhere('user_id', $id)->firstOrFail()
            : $query->where('user_id', $id)->firstOrFail();

        $this->authorize('view', $profile);
        return response()->json($this->withRoles($profile));
    }

    /**
     * GET /profiles/me — устойчивая версия.
     *
     * Никаких eager-relations и firstOrFail: у части учёток (созданных через
     * приглашение) связки users/profiles/companies могут быть неконсистентны,
     * и Eloquent падал с 500 → фронт вис на «Загружаем личный кабинет…».
     * Здесь читаем строки напрямую, каждый доп. блок — best effort.
     */
    public function me(): JsonResponse
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['message' => 'Не авторизован'], 401);
        }

        $domainUserId = method_exists($user, 'domainUserId') ? $user->domainUserId() : $user->id;

        try {
            $row = DB::table('profiles')->where('user_id', $domainUserId)->first();

            // Фолбэк: профиль мог быть привязан к auth-id, а не к domain-id.
            if (!$row && (string) $user->getAuthIdentifier() !== (string) $domainUserId) {
                $row = DB::table('profiles')->where('user_id', $user->getAuthIdentifier())->first();
            }

            // Самовосстановление: профиля нет — создаём минимальный.
            // Не чаще раза в 60 секунд на пользователя: repair перебирает
            // схему (SHOW COLUMNS) и пишет строки, а при повторяющихся заходах
            // это множит нагрузку на и без того ограниченный пул соединений.
            if (!$row) {
                $healKey = 'profile_selfheal:' . $domainUserId;
                if (\Illuminate\Support\Facades\Cache::add($healKey, 1, 60)) {
                    try {
                        app(\App\Services\AuthUserService::class)->repairDomainRowsForLogin($user);
                        if (method_exists($user, 'forgetDomainMemo')) {
                            $user->forgetDomainMemo();
                        }
                    } catch (\Throwable $e) {
                        \Log::warning('profiles/me self-heal failed', [
                            'user_id' => $domainUserId,
                            'reason'  => $e->getMessage(),
                        ]);
                    }
                }
                $row = DB::table('profiles')->where('user_id', $domainUserId)->first();
                if (!$row) {
                    \Log::warning('profiles/me: профиль отсутствует после self-heal', [
                        'user_id' => $domainUserId,
                        'auth_id' => (string) $user->getAuthIdentifier(),
                    ]);
                }
            }


            if (!$row) {
                return response()->json(['message' => 'Профиль не найден', 'code' => 'profile_missing'], 404);
            }

            return response()->json($this->presentRow($row));
        } catch (\Throwable $e) {
            \Log::error('profiles/me failed', [
                'user_id' => $domainUserId,
                'error'   => $e->getMessage(),
            ]);
            return response()->json([
                'message' => 'Не удалось загрузить профиль',
                'code'    => 'profile_load_failed',
                'detail'  => $e->getMessage(),
            ], 500);
        }
    }

    /** Собирает payload профиля из сырой строки, каждый блок — best effort. */
    private function presentRow(object $row): array
    {
        $payload = (array) $row;
        $payload['is_verified'] = (bool) ($payload['is_verified'] ?? false);

        try {
            $payload['roles'] = DB::table('user_roles')
                ->where('user_id', $row->user_id)
                ->pluck('role')
                ->values()
                ->all();
        } catch (\Throwable) {
            $payload['roles'] = [];
        }

        try {
            $u = DB::table('users')->where('id', $row->user_id)->first();
            $payload['email'] = $u->email ?? null;
            $payload['user']  = $u ? [
                'id'    => $u->id,
                'email' => $u->email,
                'meta'  => is_string($u->meta ?? null) ? json_decode($u->meta, true) : ($u->meta ?? null),
            ] : null;
        } catch (\Throwable) {
            $payload['email'] = null;
            $payload['user']  = null;
        }

        try {
            $payload['company'] = ($row->company_id ?? null)
                ? DB::table('companies')->where('id', $row->company_id)->first()
                : null;
        } catch (\Throwable) {
            $payload['company'] = null;
        }

        return $payload;
    }

    private function withRoles(Profile $profile): array
    {
        $payload = $profile->toArray();
        $payload['roles'] = DB::table('user_roles')
            ->where('user_id', $profile->user_id)
            ->pluck('role')
            ->values()
            ->all();
        $payload['email'] = DB::table('users')->where('id', $profile->user_id)->value('email');
        return $payload;
    }


    public function update(Request $request, string $id): JsonResponse
    {
        $profile = Profile::findOrFail($id);
        $this->authorize('update', $profile);

        $data = $request->validate([
            'full_name'        => 'sometimes|string|max:255',
            'avatar_url'       => 'sometimes|nullable|string',
            'chat_sticker_url' => 'sometimes|nullable|string',
            'department'       => 'sometimes|nullable|string|max:255',
            'position_id'      => 'sometimes|nullable|uuid|exists:positions,id',
            'requested_role'   => 'sometimes|nullable|string|max:32',
        ]);
        $profile->update($data);
        return response()->json($profile->fresh());
    }

    /** POST /profiles/{id}/verify — Gate verify-users. */
    public function verify(string $id): JsonResponse
    {
        $this->authorize('verify-users');
        $profile = Profile::findOrFail($id);
        $profile->update(['is_verified' => true]);
        return response()->json($profile);
    }
}
