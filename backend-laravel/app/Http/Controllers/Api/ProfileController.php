<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Profile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        return response()->json($query->paginate(min((int) $request->get('per_page', 50), 200)));
    }

    public function show(string $id): JsonResponse
    {
        $query = Profile::with(['user', 'company']);

        // Если $id — UUID, ищем по primary key (старый контракт),
        // иначе считаем это user_id (новый фронт-контракт useLaravelProfile).
        $isUuid = (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id);
        $profile = $isUuid
            ? $query->findOrFail($id)
            : $query->where('user_id', $id)->firstOrFail();

        $this->authorize('view', $profile);
        return response()->json($this->withRoles($profile));
    }

    public function me(): JsonResponse
    {
        $user = auth()->user();
        $domainUserId = method_exists($user, 'domainUserId') ? $user->domainUserId() : $user->id;
        $profile = Profile::with(['user', 'company'])->where('user_id', $domainUserId)->firstOrFail();
        return response()->json($this->withRoles($profile));
    }

    private function withRoles(Profile $profile): array
    {
        $payload = $profile->toArray();
        $payload['roles'] = \DB::table('user_roles')
            ->where('user_id', $profile->user_id)
            ->pluck('role')
            ->values()
            ->all();
        return $payload;
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $profile = Profile::findOrFail($id);
        $this->authorize('update', $profile);

        $data = $request->validate([
            'full_name'      => 'sometimes|string|max:255',
            'avatar_url'     => 'sometimes|nullable|string',
            'department'     => 'sometimes|nullable|string|max:255',
            'position_id'    => 'sometimes|nullable|uuid|exists:positions,id',
            'requested_role' => 'sometimes|nullable|string|max:32',
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
