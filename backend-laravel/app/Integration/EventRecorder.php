<?php

namespace App\Integration;

use App\Jobs\DeliverWebhook;
use App\Models\IntegrationEvent;
use App\Models\WebhookSubscription;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Единая точка записи событий платформы.
 *
 * Событие сначала попадает в журнал integration_events (его читает pull-фид,
 * поэтому событие не теряется, даже если ни один вебхук не доставлен), и лишь
 * затем ставится в очередь на доставку подписчикам.
 */
class EventRecorder
{
    /** Готовность схемы проверяется один раз за процесс, а не на каждую запись. */
    private ?bool $tableReady = null;

    public function record(
        string $companyId,
        string $resource,
        string $event,
        ?string $recordId,
        array $payload,
    ): ?IntegrationEvent {
        if ($companyId === '' || !$this->tableReady()) {
            return null;
        }

        [$actorType, $actorId] = $this->actor();

        $row = IntegrationEvent::create([
            'id'          => (string) Str::uuid(),
            'company_id'  => $companyId,
            'resource'    => $resource,
            'event'       => $event,
            'record_id'   => $recordId,
            'payload'     => $payload,
            'actor_type'  => $actorType,
            'actor_id'    => $actorId,
            'occurred_at' => now(),
        ]);

        $this->fanOut($row);

        return $row;
    }

    /**
     * Журнал может отсутствовать: провайдер поднимается раньше миграций, а на
     * свежей базе первые записи (сидеры) идут до создания таблицы.
     */
    private function tableReady(): bool
    {
        if ($this->tableReady === null) {
            try {
                $this->tableReady = Schema::hasTable('integration_events');
            } catch (\Throwable) {
                $this->tableReady = false;
            }
        }

        return $this->tableReady;
    }

    /** Постановка доставки в очередь по всем подходящим подпискам компании. */
    private function fanOut(IntegrationEvent $row): void
    {
        $subs = WebhookSubscription::withoutGlobalScopes()
            ->where('company_id', $row->company_id)
            ->where('is_active', true)
            ->get();

        foreach ($subs as $sub) {
            $events = is_array($sub->events) ? $sub->events : [];
            if (!$this->subscribed($events, (string) $row->event)) {
                continue;
            }

            try {
                DeliverWebhook::dispatch((string) $sub->id, (string) $row->id, 1);
            } catch (\Throwable $e) {
                // Событие уже в журнале — внешняя система догонит его через фид.
                Log::warning('integration.fanout_failed', [
                    'subscription' => $sub->id,
                    'event'        => $row->event,
                    'error'        => $e->getMessage(),
                ]);
            }
        }
    }

    /**
     * Подписка совпадает при точном имени, маске домена (`leave_requests.*`)
     * или полном `*`.
     */
    private function subscribed(array $events, string $event): bool
    {
        if (in_array('*', $events, true) || in_array($event, $events, true)) {
            return true;
        }

        [$resource] = explode('.', $event, 2);

        return in_array($resource . '.*', $events, true);
    }

    /** @return array{0:string,1:?string} */
    private function actor(): array
    {
        $request = request();
        if ($request instanceof Request) {
            $context = $request->attributes->get('api_context');
            if ($context instanceof ApiContext) {
                return ['api_key', $context->keyId];
            }
        }

        $user = auth()->user();
        if ($user !== null) {
            return ['user', (string) $user->getAuthIdentifier()];
        }

        return ['system', null];
    }
}
