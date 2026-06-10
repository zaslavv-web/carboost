<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Внутренняя продуктовая аналитика (аналог Mixpanel).
 *
 * POST /api/analytics/ingest        — публичный, принимает батч событий
 * GET  /api/analytics/overview      — DAU/события/ошибки за период
 * GET  /api/analytics/events        — топ event_name (функционал/реальные задачи)
 * GET  /api/analytics/paths         — переходы между экранами (Sankey-данные)
 * GET  /api/analytics/problems      — js/api ошибки, дропы сессий
 * GET  /api/analytics/user-timeline — таймлайн событий конкретного пользователя
 * GET  /api/analytics/sessions      — последние сессии (фильтр по user/company)
 */
class AnalyticsController extends Controller
{
    /** Безопасные ключи в `properties` — всё остальное вырежется. */
    private const PROP_WHITELIST = [
        'route', 'from', 'to', 'value', 'label', 'count', 'duration', 'status',
        'kind', 'category', 'reason', 'message', 'code', 'step', 'lcp', 'cls', 'inp',
        'product_id', 'order_id', 'ticket_id', 'template_id', 'tab', 'lang',
    ];

    /* ---------- INGEST ---------- */

    public function ingest(Request $request)
    {
        $payload = $request->validate([
            'events'     => 'required|array|min:1|max:200',
            'events.*.event_type' => 'required|string|max:32',
            'events.*.event_name' => 'required|string|max:160',
            'events.*.session_id' => 'required|uuid',
            'events.*.occurred_at' => 'nullable|date',
            'session'    => 'nullable|array',
        ]);

        $user = Auth::guard('sanctum')->user();
        $userId    = $user?->id;
        $companyId = $user && method_exists($user, 'companyId') ? $user->companyId() : null;
        $role      = $userId
            ? (DB::table('user_roles')->where('user_id', $userId)->value('role'))
            : null;
        $imp       = $request->attributes->get('impersonator');
        $impersonator = $imp?->id;

        $ipSalt  = date('Y-m-d');
        $ipHash  = $request->ip() ? hash('sha256', $request->ip() . '|' . $ipSalt) : null;
        $ua      = substr((string) $request->userAgent(), 0, 510);
        $now     = now();

        $rows = [];
        foreach ($payload['events'] as $e) {
            $rows[] = [
                'session_id'   => $e['session_id'],
                'user_id'      => $userId,
                'company_id'   => $companyId,
                'role'         => $role,
                'impersonated_by' => $impersonator,
                'event_type'   => substr($e['event_type'], 0, 32),
                'event_name'   => substr($e['event_name'], 0, 160),
                'route'        => isset($e['route']) ? substr((string)$e['route'], 0, 255) : null,
                'path'         => isset($e['path']) ? substr((string)$e['path'], 0, 512) : null,
                'referrer'     => isset($e['referrer']) ? substr((string)$e['referrer'], 0, 512) : null,
                'component'    => isset($e['component']) ? substr((string)$e['component'], 0, 160) : null,
                'target'       => isset($e['target']) ? substr((string)$e['target'], 0, 255) : null,
                'duration_ms'  => isset($e['duration_ms']) ? (int)$e['duration_ms'] : null,
                'status_code'  => isset($e['status_code']) ? (int)$e['status_code'] : null,
                'properties'   => json_encode($this->sanitizeProps($e['properties'] ?? [])),
                'ua'           => $ua,
                'ip_hash'      => $ipHash,
                'app_version'  => isset($e['app_version']) ? substr((string)$e['app_version'], 0, 32) : null,
                'locale'       => isset($e['locale']) ? substr((string)$e['locale'], 0, 16) : null,
                'occurred_at'  => isset($e['occurred_at']) ? \Carbon\Carbon::parse($e['occurred_at']) : $now,
                'received_at'  => $now,
            ];
        }

        DB::table('analytics_events')->insert($rows);

        // upsert сессии (legкий агрегат)
        if (!empty($payload['session']) && !empty($payload['session']['id'])) {
            $s = $payload['session'];
            $sid = $s['id'];
            $existing = DB::table('analytics_sessions')->where('id', $sid)->first();
            $base = [
                'user_id'      => $userId,
                'company_id'   => $companyId,
                'role'         => $role,
                'last_seen_at' => $now,
                'ua'           => $ua,
                'locale'       => $s['locale'] ?? null,
                'app_version'  => $s['app_version'] ?? null,
                'device'       => $s['device'] ?? null,
                'viewport'     => $s['viewport'] ?? null,
                'updated_at'   => $now,
            ];
            $pages  = count(array_filter($rows, fn($r) => $r['event_type'] === 'page_view'));
            $errors = count(array_filter($rows, fn($r) => in_array($r['event_type'], ['js_error', 'api_error'], true)));
            if ($existing) {
                DB::table('analytics_sessions')->where('id', $sid)->update(array_merge($base, [
                    'pages_count'  => (int)$existing->pages_count + $pages,
                    'events_count' => (int)$existing->events_count + count($rows),
                    'errors_count' => (int)$existing->errors_count + $errors,
                    'exit_route'   => $s['route'] ?? $existing->exit_route,
                    'ended_at'     => !empty($s['ended']) ? $now : $existing->ended_at,
                    'ended_reason' => $s['ended_reason'] ?? $existing->ended_reason,
                ]));
            } else {
                DB::table('analytics_sessions')->insert(array_merge($base, [
                    'id'           => $sid,
                    'started_at'   => isset($s['started_at']) ? \Carbon\Carbon::parse($s['started_at']) : $now,
                    'entry_route'  => $s['route'] ?? null,
                    'exit_route'   => $s['route'] ?? null,
                    'pages_count'  => $pages,
                    'events_count' => count($rows),
                    'errors_count' => $errors,
                    'ended_at'     => !empty($s['ended']) ? $now : null,
                    'ended_reason' => $s['ended_reason'] ?? null,
                    'created_at'   => $now,
                ]));
            }
        }

        return response()->json(['ok' => true, 'received' => count($rows)], 202);
    }

    private function sanitizeProps($props): array
    {
        if (!is_array($props)) return [];
        $out = [];
        foreach ($props as $k => $v) {
            if (!in_array($k, self::PROP_WHITELIST, true)) continue;
            if (is_scalar($v)) $out[$k] = is_string($v) ? substr($v, 0, 500) : $v;
        }
        return $out;
    }

    /* ---------- AUTH / SCOPE ---------- */

    private function scope(Request $request)
    {
        $user = $request->user();
        abort_if(!$user, 401);
        $imp = $request->attributes->get('impersonator');
        $isSuper = (method_exists($user, 'hasRole') && $user->hasRole('superadmin'))
            || ($imp && method_exists($imp, 'hasRole') && $imp->hasRole('superadmin'));
        abort_if(!$isSuper, 403, 'Нет доступа к продуктовой аналитике');
        return [
            'is_super'   => true,
            'company_id' => method_exists($user, 'companyId') ? $user->companyId() : null,
        ];
    }

    private function range(Request $request): array
    {
        $days = max(1, min(180, (int)$request->get('days', 14)));
        return [now()->subDays($days), now(), $days];
    }

    private function applyScope($q, array $scope, ?string $companyId = null)
    {
        if (!$scope['is_super']) {
            $q->where('company_id', $scope['company_id']);
        } elseif ($companyId) {
            $q->where('company_id', $companyId);
        }
        return $q;
    }

    /* ---------- ANALYTICS QUERIES ---------- */

    public function overview(Request $request)
    {
        try {
            $scope = $this->scope($request);
            [$from, $to] = $this->range($request);

            if (!\Schema::hasTable('analytics_events') || !\Schema::hasTable('analytics_sessions')) {
                return response()->json([
                    'total_events' => 0,
                    'total_sessions' => 0,
                    'errored_sessions' => 0,
                    'avg_session_seconds' => 0,
                    'dau' => [],
                    'top_routes' => [],
                    'top_actions' => [],
                ]);
            }

            $events = DB::table('analytics_events')->whereBetween('occurred_at', [$from, $to]);
            $sessions = DB::table('analytics_sessions')->whereBetween('started_at', [$from, $to]);
            $this->applyScope($events, $scope, $request->get('company_id'));
            $this->applyScope($sessions, $scope, $request->get('company_id'));

            $totalEvents = (clone $events)->count();
            $dau = (clone $events)
                ->selectRaw("DATE_FORMAT(occurred_at, '%Y-%m-%d') as d,
                             COUNT(DISTINCT user_id) as users,
                             COUNT(*) as events")
                ->groupByRaw("DATE_FORMAT(occurred_at, '%Y-%m-%d')")
                ->orderByRaw("DATE_FORMAT(occurred_at, '%Y-%m-%d')")
                ->get();
            $totalSessions = (clone $sessions)->count();
            $erroredSessions = (clone $sessions)->where('errors_count', '>', 0)->count();
            $avgDuration = (clone $sessions)
                ->whereNotNull('ended_at')
                ->selectRaw('AVG(TIMESTAMPDIFF(SECOND, started_at, ended_at)) as s')->value('s');

            $topRoutes = (clone $events)->where('event_type', 'page_view')
                ->select('route', DB::raw('COUNT(*) as count'))
                ->groupBy('route')->orderByDesc('count')->limit(8)->get();
            $topActions = (clone $events)->where('event_type', 'action')
                ->select('event_name', DB::raw('COUNT(*) as count'))
                ->groupBy('event_name')->orderByDesc('count')->limit(8)->get();


            return response()->json([
                'total_events' => $totalEvents,
                'total_sessions' => $totalSessions,
                'errored_sessions' => $erroredSessions,
                'avg_session_seconds' => $avgDuration ? (int)$avgDuration : 0,
                'dau' => $dau,
                'top_routes' => $topRoutes,
                'top_actions' => $topActions,
            ]);
        } catch (\Throwable $e) {
            \Log::error('analytics.overview failed', [
                'err' => $e->getMessage(),
                'file' => $e->getFile() . ':' . $e->getLine(),
            ]);
            return response()->json([
                'error' => 'analytics_failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }


    public function events(Request $request)
    {
        $scope = $this->scope($request);
        [$from, $to] = $this->range($request);
        $q = DB::table('analytics_events')->whereBetween('occurred_at', [$from, $to]);
        $this->applyScope($q, $scope, $request->get('company_id'));
        if ($type = $request->get('type')) $q->where('event_type', $type);
        if ($role = $request->get('role')) $q->where('role', $role);

        $rows = $q->select('event_name', 'event_type',
                DB::raw('COUNT(*) as count'),
                DB::raw('COUNT(DISTINCT user_id) as users'))
            ->groupBy('event_name', 'event_type')
            ->orderByDesc('count')->limit(100)->get();

        return response()->json(['events' => $rows]);
    }

    public function paths(Request $request)
    {
        $scope = $this->scope($request);
        [$from, $to] = $this->range($request);
        $groupBy = $request->get('group_by'); // role|department|company|user

        $q = DB::table('analytics_events as e')
            ->where('e.event_type', 'page_view')
            ->whereBetween('e.occurred_at', [$from, $to])
            ->whereNotNull('e.route');
        $this->applyScope($q, $scope, $request->get('company_id'));
        if ($role = $request->get('role')) $q->where('e.role', $role);
        if ($userId = $request->get('user_id')) $q->where('e.user_id', $userId);

        // Достаём pages_view упорядоченно, считаем переходы from->to
        $rows = $q->orderBy('e.session_id')->orderBy('e.occurred_at')
            ->limit(20000)
            ->get(['e.session_id', 'e.route', 'e.user_id', 'e.role']);

        $transitions = [];
        $prevBySession = [];
        foreach ($rows as $r) {
            $prev = $prevBySession[$r->session_id] ?? null;
            if ($prev && $prev !== $r->route) {
                $key = $prev . '|' . $r->route;
                $transitions[$key] = ($transitions[$key] ?? 0) + 1;
            }
            $prevBySession[$r->session_id] = $r->route;
        }
        $list = [];
        foreach ($transitions as $k => $count) {
            [$from2, $to2] = explode('|', $k, 2);
            $list[] = ['from' => $from2, 'to' => $to2, 'count' => $count];
        }
        usort($list, fn($a, $b) => $b['count'] <=> $a['count']);
        return response()->json(['transitions' => array_slice($list, 0, 80)]);
    }

    public function problems(Request $request)
    {
        $scope = $this->scope($request);
        [$from, $to] = $this->range($request);

        $base = DB::table('analytics_events')->whereBetween('occurred_at', [$from, $to]);
        $this->applyScope($base, $scope, $request->get('company_id'));

        $jsErrors = (clone $base)->where('event_type', 'js_error')
            ->select('event_name', 'component', 'route',
                DB::raw('COUNT(*) as count'),
                DB::raw('COUNT(DISTINCT user_id) as users'),
                DB::raw('MAX(occurred_at) as last_seen'))
            ->groupBy('event_name', 'component', 'route')
            ->orderByDesc('count')->limit(30)->get();

        $apiErrors = (clone $base)->where('event_type', 'api_error')
            ->select('event_name', 'status_code', 'route',
                DB::raw('COUNT(*) as count'),
                DB::raw('COUNT(DISTINCT user_id) as users'),
                DB::raw('MAX(occurred_at) as last_seen'))
            ->groupBy('event_name', 'status_code', 'route')
            ->orderByDesc('count')->limit(30)->get();

        // Дропы — последняя страница в каждой сессии
        $sessions = DB::table('analytics_sessions')->whereBetween('started_at', [$from, $to]);
        $this->applyScope($sessions, $scope, $request->get('company_id'));
        $drops = (clone $sessions)
            ->whereNotNull('exit_route')
            ->select('exit_route', DB::raw('COUNT(*) as count'))
            ->groupBy('exit_route')->orderByDesc('count')->limit(15)->get();

        return response()->json([
            'js_errors'  => $jsErrors,
            'api_errors' => $apiErrors,
            'drop_routes' => $drops,
        ]);
    }

    public function userTimeline(Request $request)
    {
        $scope = $this->scope($request);
        $userId = $request->validate(['user_id' => 'required|uuid'])['user_id'];
        $sessionId = $request->get('session_id');

        $q = DB::table('analytics_events')->where('user_id', $userId);
        $this->applyScope($q, $scope, $request->get('company_id'));
        if ($sessionId) $q->where('session_id', $sessionId);

        $events = $q->orderByDesc('occurred_at')->limit(500)->get();

        $sQ = DB::table('analytics_sessions')->where('user_id', $userId);
        $this->applyScope($sQ, $scope, $request->get('company_id'));
        $sessions = $sQ->orderByDesc('started_at')->limit(30)->get();

        return response()->json(['events' => $events, 'sessions' => $sessions]);
    }

    public function sessions(Request $request)
    {
        $scope = $this->scope($request);
        [$from, $to] = $this->range($request);
        $q = DB::table('analytics_sessions')->whereBetween('started_at', [$from, $to]);
        $this->applyScope($q, $scope, $request->get('company_id'));
        if ($role = $request->get('role')) $q->where('role', $role);
        if ($userId = $request->get('user_id')) $q->where('user_id', $userId);
        return response()->json([
            'sessions' => $q->orderByDesc('started_at')->limit(100)->get(),
        ]);
    }
}
