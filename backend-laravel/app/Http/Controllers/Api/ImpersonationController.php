<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ImpersonationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ImpersonationController extends Controller
{
    public function __construct(private ImpersonationService $svc) {}

    /** POST /api/impersonation/start { target_user_id } — only superadmin. */
    public function start(Request $request): JsonResponse
    {
        $data = $request->validate([
            // ID может быть users.id (UUID или integer) ЛИБО profiles.id / profiles.user_id —
            // exists-проверку делаем в сервисе, чтобы поддержать рассинхрон легаси-данных.
            'target_user_id' => 'required|string',
            'ttl_minutes'    => 'nullable|integer|min:1|max:480',
        ]);
        $result = $this->svc->start(
            $request->user(),
            $data['target_user_id'],
            $data['ttl_minutes'] ?? 60,
        );
        return response()->json($result, 201);
    }

    /** POST /api/impersonation/stop — отзывает все impersonation-токены актора. */
    public function stop(Request $request): JsonResponse
    {
        // Если сейчас под impersonation — actor сидит в attributes, иначе сам user.
        $actor = $request->attributes->get('impersonator') ?? $request->user();
        $this->svc->stop($actor);
        return response()->json(null, 204);
    }
}
