<?php

namespace App\Jobs;

use App\Models\IntegrationEvent;
use App\Models\WebhookDelivery;
use App\Models\WebhookSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Доставка одного события одному подписчику.
 *
 * Ретраи ведём сами, а не через $tries: каждая попытка должна остаться в
 * журнале доставок, чтобы администратор в UI видел историю, а не только
 * последний отказ.
 */
class DeliverWebhook implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Задержки перед повторами, в секундах: 1 мин, 5 мин, 30 мин, 2 ч, 6 ч. */
    private const BACKOFF = [60, 300, 1800, 7200, 21600];

    public const MAX_ATTEMPTS = 6;

    public function __construct(
        private readonly string $subscriptionId,
        private readonly string $eventId,
        private readonly int $attempt = 1,
    ) {
    }

    public function handle(): void
    {
        $sub = WebhookSubscription::withoutGlobalScopes()->find($this->subscriptionId);
        if ($sub === null || !$sub->is_active) {
            return;
        }

        $event = IntegrationEvent::query()->where('id', $this->eventId)->first();
        if ($event === null) {
            return;
        }

        $body = [
            'id'           => $event->id,
            'event'        => $event->event,
            'resource'     => $event->resource,
            'record_id'    => $event->record_id,
            'company_id'   => $event->company_id,
            'cursor'       => (int) $event->cursor,
            'occurred_at'  => optional($event->occurred_at)->toIso8601String(),
            'delivered_at' => now()->toIso8601String(),
            'attempt'      => $this->attempt,
            'api_version'  => $sub->api_version ?? 'v1',
            'data'         => $event->payload,
        ];

        $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $signature = hash_hmac('sha256', (string) $json, (string) $sub->secret);

        $status = null;
        $snippet = null;
        try {
            $response = Http::timeout(10)
                ->withHeaders([
                    'Content-Type'            => 'application/json',
                    'X-GrowthPeak-Event'      => (string) $event->event,
                    'X-GrowthPeak-Event-Id'   => (string) $event->id,
                    'X-GrowthPeak-Delivery'   => (string) $this->attempt,
                    'X-GrowthPeak-Signature'  => 'sha256=' . $signature,
                ])
                ->withBody((string) $json, 'application/json')
                ->post($sub->url);
            $status = $response->status();
            $snippet = substr((string) $response->body(), 0, 500);
        } catch (\Throwable $e) {
            $snippet = 'exception: ' . substr($e->getMessage(), 0, 400);
        }

        $ok = $status !== null && $status < 400;
        $exhausted = !$ok && $this->attempt >= self::MAX_ATTEMPTS;
        $nextAt = $ok || $exhausted ? null : now()->addSeconds($this->backoffSeconds());

        WebhookDelivery::create([
            'subscription_id'  => $sub->id,
            'company_id'       => $sub->company_id,
            'event'            => $event->event,
            'event_id'         => $event->id,
            'payload'          => $body,
            'http_status'      => $status,
            'response_snippet' => $snippet,
            'attempt'          => $this->attempt,
            'status'           => $ok ? 'ok' : ($exhausted ? 'exhausted' : 'failed'),
            'next_attempt_at'  => $nextAt,
            'delivered_at'     => now(),
        ]);

        $sub->forceFill([
            'last_delivery_at'     => now(),
            'last_delivery_status' => $ok ? 'ok' : 'error',
            'failure_count'        => $ok ? 0 : (int) ($sub->failure_count ?? 0) + 1,
        ])->saveQuietly();

        if ($ok || $exhausted) {
            if ($exhausted) {
                Log::warning('webhook.delivery_exhausted', [
                    'subscription' => $sub->id,
                    'event'        => $event->event,
                    'attempts'     => $this->attempt,
                ]);
            }

            return;
        }

        self::dispatch($this->subscriptionId, $this->eventId, $this->attempt + 1)
            ->delay($nextAt);
    }

    private function backoffSeconds(): int
    {
        $index = min($this->attempt - 1, count(self::BACKOFF) - 1);

        return self::BACKOFF[max($index, 0)];
    }
}
