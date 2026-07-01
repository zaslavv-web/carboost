<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WebhookDelivery;
use App\Models\WebhookSubscription;
use App\Services\WebhookDispatcher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Управление подписками на события платформы для компании.
 * Доступ — HRD/company_admin/superadmin (проверяется на уровне ролей).
 */
class WebhookController extends Controller
{
    public function events(): JsonResponse
    {
        return response()->json(['events' => WebhookDispatcher::EVENTS]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        return response()->json(
            WebhookSubscription::orderByDesc('created_at')->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate([
            'name'      => 'required|string|max:160',
            'url'       => 'required|url|max:500',
            'events'    => 'required|array|min:1',
            'events.*'  => 'string|max:96',
            'is_active' => 'boolean',
        ]);
        $data['secret'] = Str::random(48);
        $data['created_by'] = $request->user()->getAuthIdentifier();
        $sub = WebhookSubscription::create($data);

        // При первом создании возвращаем секрет — потом он скрыт ($hidden).
        return response()->json($sub->toArray() + ['secret' => $data['secret']], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorizeAdmin($request);
        $sub = WebhookSubscription::findOrFail($id);
        $data = $request->validate([
            'name'      => 'sometimes|string|max:160',
            'url'       => 'sometimes|url|max:500',
            'events'    => 'sometimes|array|min:1',
            'events.*'  => 'string|max:96',
            'is_active' => 'sometimes|boolean',
        ]);
        $sub->update($data);
        return response()->json($sub->fresh());
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->authorizeAdmin($request);
        WebhookSubscription::where('id', $id)->delete();
        return response()->json(['ok' => true]);
    }

    public function test(Request $request, string $id, WebhookDispatcher $dispatcher): JsonResponse
    {
        $this->authorizeAdmin($request);
        $sub = WebhookSubscription::findOrFail($id);
        $dispatcher->dispatch('platform.ping', [
            'message' => 'test delivery',
            'triggered_by' => $request->user()->getAuthIdentifier(),
        ], $sub->company_id);
        return response()->json(['ok' => true]);
    }

    public function deliveries(Request $request, string $id): JsonResponse
    {
        $this->authorizeAdmin($request);
        WebhookSubscription::findOrFail($id); // проверка скоупа
        $rows = WebhookDelivery::where('subscription_id', $id)
            ->orderByDesc('delivered_at')
            ->limit(50)
            ->get();
        return response()->json($rows);
    }

    private function authorizeAdmin(Request $request): void
    {
        $user = $request->user();
        $allowed = $user && ($user->hasRole('hrd') || $user->hasRole('company_admin') || $user->hasRole('superadmin'));
        abort_unless($allowed, 403, 'Only HR admins can manage webhooks');
    }
}
