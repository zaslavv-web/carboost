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
        $profile = Profile::with(['user', 'company'])->findOrFail($id);
        $this->authorize('view', $profile);
        return response()->json($profile);
    }

    public function me(): JsonResponse
    {
        $user = auth()->user();
        $profile = Profile::with('company')->where('user_id', $user->id)->firstOrFail();
        return response()->json($profile);
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
