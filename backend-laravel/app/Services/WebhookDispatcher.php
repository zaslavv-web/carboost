<?php

namespace App\Services;

use App\Models\WebhookDelivery;
use App\Models\WebhookSubscription;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Централизованный диспетчер вебхуков компании.
 *
 * Использование:
 *   app(WebhookDispatcher::class)->dispatch('leave.approved', [...], $companyId);
 *
 * События подписываются на уровне webhook_subscriptions.events (JSON-массив).
 */
class WebhookDispatcher
{
    /** Известные события платформы (для UI-подсказок). */
    public const EVENTS = [
        'leave.requested',
        'leave.approved',
        'leave.rejected',
        'onboarding.assigned',
        'onboarding.completed',
        'performance.review.finalized',
        'idp.created',
        'idp.completed',
        'employee.hired',
        'employee.departed',
        'risk.high_detected',
    ];

    public function dispatch(string $event, array $payload, ?string $companyId = null): void
    {
        // Убираем глобальный CompanyScope — доставка идёт из системного контекста.
        $subs = WebhookSubscription::withoutGlobalScopes()
            ->where('is_active', true)
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->get();

        foreach ($subs as $sub) {
            $events = is_array($sub->events) ? $sub->events : [];
            if (!in_array($event, $events, true) && !in_array('*', $events, true)) {
                continue;
            }
            $this->deliver($sub, $event, $payload);
        }
    }

    private function deliver(WebhookSubscription $sub, string $event, array $payload): void
    {
        $body = [
            'event'      => $event,
            'company_id' => $sub->company_id,
            'delivered_at' => now()->toIso8601String(),
            'data'       => $payload,
            'nonce'      => (string) Str::uuid(),
        ];
        $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $signature = hash_hmac('sha256', $json, (string) $sub->secret);

        $status = null;
        $snippet = null;
        try {
            $response = Http::timeout(5)
                ->withHeaders([
                    'Content-Type' => 'application/json',
                    'X-GrowthPeak-Event' => $event,
                    'X-GrowthPeak-Signature' => 'sha256=' . $signature,
                ])
                ->withBody($json, 'application/json')
                ->post($sub->url);
            $status = $response->status();
            $snippet = substr((string) $response->body(), 0, 500);
        } catch (\Throwable $e) {
            $snippet = 'exception: ' . substr($e->getMessage(), 0, 400);
            Log::warning('webhook.delivery_failed', ['sub' => $sub->id, 'event' => $event, 'error' => $e->getMessage()]);
        }

        WebhookDelivery::create([
            'subscription_id' => $sub->id,
            'company_id'      => $sub->company_id,
            'event'           => $event,
            'payload'         => $body,
            'http_status'     => $status,
            'response_snippet' => $snippet,
            'delivered_at'    => now(),
        ]);

        $sub->forceFill([
            'last_delivery_at'     => now(),
            'last_delivery_status' => $status !== null && $status < 400 ? 'ok' : 'error',
        ])->save();
    }
}
