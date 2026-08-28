<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Integration\ApiContext;
use App\Models\IntegrationEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Pull-фид событий: страховка на случай, если вебхуки не дошли.
 *
 *   GET /api/v1/events?since=<cursor>&event=employees.created&limit=100
 *
 * Курсор монотонно растёт, поэтому внешняя система хранит только последнее
 * значение и после любого простоя догоняет пропущенное без дублей.
 */
class EventFeedController extends Controller
{
    private const MAX_LIMIT = 500;

    public function index(Request $request): JsonResponse
    {
        $context = $request->attributes->get('api_context');
        abort_unless($context instanceof ApiContext, 401, 'Требуется API-ключ');
        abort_unless($context->hasScope('events:read'), 403, 'Ключу не выдан скоуп «events:read»');

        $limit = max(1, min((int) $request->query('limit', '100'), self::MAX_LIMIT));
        $since = (int) $request->query('since', '0');

        $query = IntegrationEvent::query()
            ->where('company_id', $context->companyId)
            ->where('cursor', '>', $since);

        if (($event = $request->query('event')) !== null && $event !== '') {
            $query->whereIn('event', array_map('trim', explode(',', (string) $event)));
        }

        if (($resource = $request->query('resource')) !== null && $resource !== '') {
            $query->whereIn('resource', array_map('trim', explode(',', (string) $resource)));
        }

        $rows = $query->orderBy('cursor')->limit($limit + 1)->get();
        $hasMore = $rows->count() > $limit;
        $rows = $rows->take($limit);

        return response()->json([
            'data' => $rows->map(static fn (IntegrationEvent $e) => [
                'id'          => $e->id,
                'cursor'      => (int) $e->cursor,
                'event'       => $e->event,
                'resource'    => $e->resource,
                'record_id'   => $e->record_id,
                'actor_type'  => $e->actor_type,
                'occurred_at' => optional($e->occurred_at)->toIso8601String(),
                'data'        => $e->payload,
            ])->values(),
            'page' => [
                'limit'       => $limit,
                'has_more'    => $hasMore,
                // Курсор возвращаем всегда: клиент сохраняет его и при пустой
                // выборке, иначе после паузы он перечитает всю историю заново.
                'next_cursor' => $rows->isEmpty() ? $since : (int) $rows->last()->cursor,
            ],
        ]);
    }
}
