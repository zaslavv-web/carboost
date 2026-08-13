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
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Profile::class);

        $query = Profile::query()->with(['user', 'company']);
        if ($request->boolean('unverified')) {
            $query->where('is_verified', false);
        }
        if ($companyId = $request->get('company_id')) {
            $query->where('company_id', $companyId);
        }
        if ($search = trim((string) $request->get('search', ''))) {
            $like = '%' . $search . '%';
            $query->where(function ($q) use ($like) {
                $q->where('full_name', 'like', $like)
                  ->orWhereIn('user_id', function ($sub) use ($like) {
                      $sub->select('id')->from('users')->where('email', 'like', $like);
                  });
            });
        }
        $paginated = $query->paginate(min((int) $request->get('per_page', 50), 200));
        // подмешиваем email
        $items = collect($paginated->items());
        $userIds = $items->pluck('user_id')->filter()->unique()->all();
        $emails = DB::table('users')->whereIn('id', $userIds)->pluck('email', 'id');
        $paginated->getCollection()->transform(function ($p) use ($emails) {
            $arr = $p->toArray();
            $arr['email'] = $emails[$p->user_id] ?? null;
            return $arr;
        });
        return response()->json($paginated);
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
