<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Generic table CRUD bridge (Phase 10).
 *
 * Drop-in replacement for `legacy.from(table).select().eq()...`.
 *
 * Query string filters (compatible with PostgREST conventions used by the
 * legacy-js client):
 *   ?select=col1,col2
 *   ?eq.col=value          ?neq.col=value
 *   ?gt.col=10             ?gte.col=10
 *   ?lt.col=10             ?lte.col=10
 *   ?in.col=a,b,c
 *   ?is.col=null
 *   ?like.col=%foo%        ?ilike.col=%foo%
 *   ?order=col.asc,col2.desc
 *   ?limit=50&range=0-49
 *   ?single=1   (returns object instead of array; 404 if not found)
 *   ?maybeSingle=1
 *
 * Tables and their model classes are whitelisted in MODEL_MAP. Authorization
 * is delegated to the existing Phase 4 policies via Gate::allows().
 */
class DbController extends Controller
{
    private const TABLE_RESOURCES = [
        'profiles' => 'employees', 'departments' => 'employees', 'positions' => 'positions',
        'employee_invitations' => 'invitations', 'onboarding_plans' => 'adaptation',
        'onboarding_plan_steps' => 'adaptation', 'onboarding_assignments' => 'adaptation',
        'performance_reviews' => 'performance', 'performance_cycles' => 'performance',
        'performance_review_reviewers' => 'performance', 'competencies' => 'skills_matrix',
        'hr_documents' => 'hr_documents', 'knowledge_articles' => 'knowledge_base',
        'knowledge_categories' => 'knowledge_base', 'shop_products' => 'shop', 'shop_orders' => 'shop',
        'shop_order_items' => 'shop', 'shop_cart_items' => 'shop',
        'pulse_surveys' => 'pulse', 'pulse_survey_questions' => 'pulse', 'pulse_survey_responses' => 'pulse',
        'tracker_projects' => 'tracker', 'tracker_okr_periods' => 'tracker', 'tracker_goals' => 'tracker',
        'tracker_key_results' => 'tracker', 'tracker_tasks' => 'tracker', 'tracker_task_goal_links' => 'tracker',
        'tracker_task_checkins' => 'tracker', 'tracker_one_on_ones' => 'tracker', 'tracker_one_on_one_agenda' => 'tracker',
        'tracker_audit_log' => 'tracker', 'tracker_workflows' => 'tracker', 'tracker_workflow_statuses' => 'tracker',
        'tracker_workflow_transitions' => 'tracker', 'tracker_sprints' => 'tracker', 'tracker_comments' => 'tracker',
        'tracker_attachments' => 'tracker',
    ];

    /**
     * Самообслуживание: действия, которые не проходят через матрицу разделов.
     * Матрица описывает доступ к админ-разделам, а не к личным данным сотрудника,
     * поэтому здесь доступ определяют политики моделей (владелец/компания).
     */
    private const SELF_SERVICE_TABLE_ACTIONS = [
        'profiles'               => ['view', 'edit'],
        'departments'            => ['view'],
        'positions'              => ['view'],
        'competencies'           => ['view', 'edit'],
        'test_attempts'          => ['view'],
        'pulse_surveys'          => ['view'],
        'pulse_survey_questions' => ['view'],
        'pulse_survey_responses' => ['view', 'edit'],
        'shop_cart_items'        => ['view', 'edit'],
        'shop_orders'            => ['view'],
        'shop_order_items'       => ['view'],
    ];

    /** Размер порции сырого чтения: ограничивает пик памяти до сборки ответа. */
    protected const RAW_CHUNK_ROWS = 25;

    /** Максимальный JSON-бюджет одного list-ответа. */
    protected const RAW_RESPONSE_BYTES = 4 * 1024 * 1024;

    /** Колонки горячих таблиц: исключают Schema::getColumnListing() из GET. */
    protected const HOT_TABLE_COLUMNS = [
        'positions' => [
            'id', 'title', 'description', 'department', 'psychological_profile',
            'competency_profile', 'created_by', 'company_id', 'profile_status',
            'profile_version', 'profile_template', 'approved_by', 'approved_at',
            'created_at', 'updated_at',
        ],
        'profiles' => [
            'id', 'user_id', 'full_name', 'position', 'department', 'avatar_url',
            'hire_date', 'overall_score', 'role_readiness', 'is_verified',
            'requested_role', 'position_id', 'company_id', 'pending_position_id',
            'is_support', 'chat_sticker_url', 'created_at', 'updated_at',
        ],
        'competencies' => [
            'id', 'user_id', 'skill_name', 'skill_value', 'company_id',
            'created_at', 'updated_at',
        ],
        'career_goals' => [
            'id', 'user_id', 'title', 'description', 'status', 'progress',
            'deadline', 'company_id', 'assignment_id', 'step_order',
            'auto_generated', 'created_at', 'updated_at',
        ],
        'notifications' => [
            'id', 'user_id', 'title', 'description', 'notification_type',
            'is_read', 'company_id', 'created_at', 'updated_at',
        ],
        'tracker_tasks' => [
            'id', 'company_id', 'project_id', 'sprint_id', 'author_id',
            'assignee_id', 'parent_task_id', 'type', 'title', 'description',
            'status', 'workflow_status_id', 'urgency', 'priority', 'story_points',
            'estimate_minutes', 'labels', 'order_index', 'due_at', 'start_at',
            'jira_key', 'completed_at', 'last_notified_at', 'created_at', 'updated_at',
        ],
    ];

    /** table_name => Model::class (must use BelongsToCompany trait) */
    protected const MODEL_MAP = [
        'profiles'                 => \App\Models\Profile::class,
        'companies'                => \App\Models\Company::class,
        'departments'              => \App\Models\Department::class,
        'positions'                => \App\Models\Position::class,
        'position_career_paths'    => \App\Models\PositionCareerPath::class,
        'career_track_templates'   => \App\Models\CareerTrackTemplate::class,
        'employee_career_assignments' => \App\Models\EmployeeCareerAssignment::class,
        'career_step_submissions'  => \App\Models\CareerStepSubmission::class,
        'career_step_scenarios'    => \App\Models\CareerStepScenario::class,
        'career_level_actions'     => \App\Models\CareerLevelAction::class,
        'career_goals'             => \App\Models\CareerGoal::class,
        'goal_checklist_items'     => \App\Models\GoalChecklistItem::class,
        'achievements'             => \App\Models\Achievement::class,
        'assessments'              => \App\Models\Assessment::class,
        'assessment_scenarios'     => \App\Models\AssessmentScenario::class,
        'closed_question_tests'    => \App\Models\ClosedQuestionTest::class,
        'test_attempts'            => \App\Models\TestAttempt::class,
        'competencies'             => \App\Models\Competency::class,
        'currency_balances'        => \App\Models\CurrencyBalance::class,
        'currency_transactions'    => \App\Models\CurrencyTransaction::class,
        'company_currency_settings' => \App\Models\CompanyCurrencySettings::class,
        'company_onboarding_settings' => \App\Models\CompanyOnboardingSettings::class,
        'hrd_checklist_items'      => \App\Models\HrdChecklistItem::class,
        'demo_requests'            => \App\Models\DemoRequest::class,
        'employee_invitations'     => \App\Models\EmployeeInvitation::class,
        'employee_questionnaires'  => \App\Models\EmployeeQuestionnaire::class,
        'employee_rewards'         => \App\Models\EmployeeReward::class,
        'employee_risk_scores'     => \App\Models\EmployeeRiskScore::class,
        'gamification_reward_types' => \App\Models\GamificationRewardType::class,
        'hr_documents'             => \App\Models\HrDocument::class,
        'hr_tasks'                 => \App\Models\HrTask::class,
        'hr_task_assignees'        => \App\Models\HrTaskAssignee::class,
        'notifications'            => \App\Models\Notification::class,
        'support_tickets'          => \App\Models\SupportTicket::class,
        'team_members'             => \App\Models\TeamMember::class,
        'user_roles'               => \App\Models\UserRole::class,
        'email_domain_position_mappings' => \App\Models\EmailDomainPositionMapping::class,

        // Tracker module
        'tracker_projects'           => \App\Models\TrackerProject::class,
        'tracker_okr_periods'        => \App\Models\TrackerOkrPeriod::class,
        'tracker_goals'              => \App\Models\TrackerGoal::class,
        'tracker_key_results'        => \App\Models\TrackerKeyResult::class,
        'tracker_tasks'              => \App\Models\TrackerTask::class,
        'tracker_task_goal_links'    => \App\Models\TrackerTaskGoalLink::class,
        'tracker_task_checkins'      => \App\Models\TrackerTaskCheckin::class,
        'tracker_one_on_ones'        => \App\Models\TrackerOneOnOne::class,
        'tracker_one_on_one_agenda'  => \App\Models\TrackerOneOnOneAgenda::class,
        'tracker_audit_log'          => \App\Models\TrackerAuditLog::class,
        'tracker_workflows'              => \App\Models\TrackerWorkflow::class,
        'tracker_workflow_statuses'      => \App\Models\TrackerWorkflowStatus::class,
        'tracker_workflow_transitions'   => \App\Models\TrackerWorkflowTransition::class,
        'tracker_sprints'                => \App\Models\TrackerSprint::class,
        'tracker_comments'               => \App\Models\TrackerComment::class,
        'tracker_attachments'            => \App\Models\TrackerAttachment::class,

        // Gamification
        'gamification_levels'         => \App\Models\GamificationLevel::class,
        // Публичное "view" наград — алиас на ту же таблицу (без серверных полей)
        'gamification_rewards_public' => \App\Models\GamificationRewardType::class,

        // Peer recognition
        'peer_recognitions'           => \App\Models\PeerRecognition::class,
        'peer_recognition_reactions'  => \App\Models\PeerRecognitionReaction::class,

        // Shop
        'shop_products'    => \App\Models\ShopProduct::class,
        'shop_orders'      => \App\Models\ShopOrder::class,
        'shop_order_items' => \App\Models\ShopOrderItem::class,
        'shop_cart_items'  => \App\Models\ShopCartItem::class,

        // Onboarding (Волна 1)
        'onboarding_plans'         => \App\Models\OnboardingPlan::class,
        'onboarding_plan_steps'    => \App\Models\OnboardingPlanStep::class,
        'onboarding_assignments'   => \App\Models\OnboardingAssignment::class,
        'onboarding_step_progress' => \App\Models\OnboardingStepProgress::class,

        // L&D (Волна 2): ИПР + База знаний
        'individual_development_plans' => \App\Models\IndividualDevelopmentPlan::class,
        'idp_items'                    => \App\Models\IdpItem::class,
        'knowledge_categories'         => \App\Models\KnowledgeCategory::class,
        'knowledge_articles'           => \App\Models\KnowledgeArticle::class,

        // Performance (Волна 3): 360° reviewers
        'performance_review_reviewers' => \App\Models\PerformanceReviewReviewer::class,
        'performance_reviews'          => \App\Models\PerformanceReview::class,
        'performance_cycles'           => \App\Models\PerformanceCycle::class,

        // Portal & Communications (Волна 4)
        'portal_posts'              => \App\Models\PortalPost::class,
        'portal_post_reactions'     => \App\Models\PortalPostReaction::class,
        'portal_post_comments'      => \App\Models\PortalPostComment::class,
        'portal_communities'        => \App\Models\PortalCommunity::class,
        'portal_community_members'  => \App\Models\PortalCommunityMember::class,
        'pulse_surveys'             => \App\Models\PulseSurvey::class,
        'pulse_survey_questions'    => \App\Models\PulseSurveyQuestion::class,
        'pulse_survey_responses'    => \App\Models\PulseSurveyResponse::class,
    ];


    /** Сколько строк отдаём, если клиент не передал limit/range. */
    protected const DEFAULT_ROWS = 500;

    /** Абсолютный потолок строк на один запрос. */
    protected const MAX_ROWS = 1000;

    protected const OPS = [
        'eq' => '=', 'neq' => '!=',
        'gt' => '>', 'gte' => '>=',
        'lt' => '<', 'lte' => '<=',
        'like' => 'like', 'ilike' => 'ilike',
    ];



    public function index(Request $request, string $table)
    {
        try {
            $this->enforceResourceAccess($request, $table, 'view');
            $model = self::resolve($table);
            $this->authorizeAny('viewAny', $model);

            // Быстрый путь для `select(..., { count: 'exact', head: true })`.
            // Считаем строки сырым запросом: без Eloquent-гидрации, глобальных
            // scope-ов и каскада служебных подзапросов (именно они на бою упирались
            // в memory_limit и лимит соединений, отдавая 500 на счётчике уведомлений).
            if ($request->boolean('head') && $request->query('count')) {
                return $this->headCount($request, $model, $table);
            }

            // Основной путь — СЫРОЙ. Eloquent гидрирует каждую строку в объект
            // модели (+ casts, + JSON-декод, + отдельная копия original), из-за
            // чего выборка вроде `positions?select=id,title,department` или
            // `career_track_templates?select=*` на бою упиралась в 256 МБ
            // (api_fatal в Eloquent\Collection). Сырые stdClass-строки дешевле
            // на порядок. Eloquent используем только там, где реально нужны
            // связи (`select=alias:relation(...)`).
            if (! $this->selectUsesRelations($request)) {
                return $this->rawIndex($request, $model, $table);
            }

            $query = $model::query();
            $this->applyFilters($query, $request);
            $this->applyRowLevelScope(
                $query,
                (new $model())->getTable(),
                \Illuminate\Support\Facades\Schema::getColumnListing((new $model())->getTable()),
            );
            $this->applySelect($query, $request);
            $this->applyOrder($query, $request);

            // count + head (legacy: .select('id', { count: 'exact', head: true }))
            $countMode = $request->query('count');
            $head = $request->boolean('head');
            $count = null;
            if ($countMode) {
                $count = (clone $query)->toBase()->getCountForPagination();
            }
            if ($head) {
                return response()->json(['data' => [], 'count' => $count]);
            }


            // Предохранитель: без явного limit/range клиент раньше мог вытащить всю
            // таблицу — именно так PHP-воркер упирался в memory_limit (64 МБ) и падал,
            // не отдав MySQL-соединение (отсюда каскад max_user_connections).
            $truncated = false;
            $effectiveLimit = null;
            if ($request->filled('range')) {
                [$from, $to] = array_map('intval', explode('-', $request->query('range')));
                $effectiveLimit = max(1, $to - $from + 1);
                $query->skip($from)->take($effectiveLimit);
            } elseif ($request->filled('limit')) {
                $effectiveLimit = min(self::MAX_ROWS, (int) $request->query('limit'));
                $query->take($effectiveLimit);
            } else {
                $effectiveLimit = self::DEFAULT_ROWS;
                // +1 строка, чтобы понять, что выборка усечена
                $query->take($effectiveLimit + 1);
            }

            if ($request->boolean('single') || $request->boolean('maybeSingle')) {
                $row = $query->first();
                if (! $row && $request->boolean('single')) {
                    return response()->json(['error' => 'Запись не найдена'], 404);
                }
                return response()->json(['data' => $row, 'count' => $count]);
            }

            $rows = $query->get();

            if (! $request->filled('range') && ! $request->filled('limit') && $rows->count() > self::DEFAULT_ROWS) {
                $truncated = true;
                $rows = $rows->take(self::DEFAULT_ROWS)->values();
                \Illuminate\Support\Facades\Log::warning('DbController unbounded query truncated', [
                    'table' => $table,
                    'query' => $request->getQueryString(),
                    'user'  => optional($request->user())->getAuthIdentifier(),
                    'limit' => self::DEFAULT_ROWS,
                ]);
            }

            return response()->json([
                'data'      => $rows,
                'count'     => $count,
                'truncated' => $truncated,
            ]);

        } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) {
            throw $e; // 403/404 из authorizeAny/resolve — не наша ошибка
        } catch (\Illuminate\Database\QueryException $e) {
            // Ошибка подключения/исчерпания лимита — не является ошибкой параметров
            // запроса. Её обязан обработать внешний RetryOnDbBusy middleware и
            // вернуть 503/db_busy. Если превратить её здесь в 400, браузерный
            // circuit breaker не откроется и все остальные запросы экрана
            // продолжат создавать PHP workers и новые попытки подключения.
            if ($this->isDatabaseBusy($e)) {
                throw $e;
            }

            // Постгрес может бросить, например, на невалидном UUID в eq.<uuid_col>=NaN.
            // Возвращаем структурированный 400 вместо общего 500 — фронт у нас в таких
            // случаях ожидает graceful fallback (`if (error) return null;`).
            \Illuminate\Support\Facades\Log::warning('DbController query failed', [
                'table' => $table,
                'query' => $request->getQueryString(),
                'sql'   => $e->getMessage(),
            ]);
            return response()->json([
                'data'  => null,
                'error' => 'Неверные параметры запроса к таблице',
                'code'  => 'invalid_query',
            ], 400);
        } catch (\Throwable $e) {
            return $this->serverError('db_index_failed', $table, $request, $e);
        }
    }

    /**
     * Единый ответ на непредвиденную ошибку: читаемый JSON с error_id и
     * подробная строка в лог (файл/строка + пик памяти). Раньше сюда попадал
     * «голый» 500 без тела — по нему невозможно было понять причину.
     */
    private function serverError(string $event, string $table, Request $request, \Throwable $e)
    {
        $errorId = substr(bin2hex(random_bytes(4)), 0, 8);
        \Illuminate\Support\Facades\Log::error($event, [
            'error_id' => $errorId,
            'table'    => $table,
            'query'    => $request->getQueryString(),
            'user'     => optional($request->user())->getAuthIdentifier(),
            'message'  => $e->getMessage(),
            'where'    => $e->getFile() . ':' . $e->getLine(),
            'peak_mb'  => round(memory_get_peak_usage(true) / 1048576, 1),
            'limit'    => ini_get('memory_limit'),
        ]);

        return response()->json([
            'data'     => null,
            'error'    => 'Внутренняя ошибка сервера. Код: ' . $errorId,
            'error_id' => $errorId,
            'code'     => 'server_error',
        ], 500);
    }

    /** Есть ли в `select` обращение к связям вида `alias:relation(cols)`. */
    private function selectUsesRelations(Request $request): bool
    {
        return $request->filled('select') && str_contains((string) $request->query('select'), '(');
    }

    /**
     * Сырая выборка через DB::table: без гидрации Eloquent и глобальных scope-ов.
     * Мультитенантность и casts воспроизводятся вручную, поэтому формат ответа
     * для фронта не меняется.
     */
    private function rawIndex(Request $request, string $model, string $table)
    {
        /** @var \Illuminate\Database\Eloquent\Model $instance */
        $instance = new $model();
        $tableName = $instance->getTable();
        $columns = self::HOT_TABLE_COLUMNS[$tableName]
            ?? \Illuminate\Support\Facades\Schema::getColumnListing($tableName);

        $query = \Illuminate\Support\Facades\DB::table($tableName);
        $this->applyFilters($query, $request);
        $this->applyCompanyScope($query, $instance, $tableName, $columns);
        $this->applyRowLevelScope($query, $tableName, $columns);
        $this->applyOrder($query, $request, $columns);

        // Проекция колонок: берём только те, что реально есть в схеме — иначе
        // рассинхрон фронта и БД даёт SQL-ошибку на ровном месте.
        $selected = $columns;
        if ($request->filled('select')) {
            $requested = array_values(array_filter(array_map(
                'trim',
                explode(',', (string) $request->query('select')),
            )));
            $requested = array_values(array_diff($requested, ['*']));
            // Быстрый отказ на неизвестной колонке: устаревший клиент (старый
            // закэшированный бандл) не должен уводить запрос в тяжёлый путь и
            // ронять процесс — отвечаем понятным 400 до обращения к БД.
            $unknown = array_values(array_diff($requested, $columns));
            if ($unknown) {
                return response()->json([
                    'data'    => null,
                    'error'   => 'Неизвестные колонки: ' . implode(', ', $unknown),
                    'code'    => 'unknown_column',
                    'table'   => $tableName,
                    'columns' => $unknown,
                ], 400);
            }
            $valid = array_values(array_intersect($requested, $columns));
            if ($valid) {
                if (in_array('id', $columns, true) && ! in_array('id', $valid, true)) {
                    $valid[] = 'id';
                }
                $selected = $valid;
            }
        }
        $query->select(array_map(fn ($c) => $tableName . '.' . $c, $selected));

        $count = null;
        if ($request->query('count')) {
            $count = (clone $query)->getCountForPagination();
        }
        if ($request->boolean('head')) {
            return response()->json(['data' => [], 'count' => $count]);
        }

        $limit = self::DEFAULT_ROWS;
        $probe = true; // берём +1 строку, чтобы понять что выборка усечена
        $baseOffset = 0;
        if ($request->filled('range')) {
            [$from, $to] = array_map('intval', explode('-', (string) $request->query('range')));
            $limit = max(1, min(self::MAX_ROWS, $to - $from + 1));
            $baseOffset = max(0, $from);
            $probe = false;
        } elseif ($request->filled('limit')) {
            $limit = max(1, min(self::MAX_ROWS, (int) $request->query('limit')));
            $probe = false;
        }
        if ($request->boolean('single') || $request->boolean('maybeSingle')) {
            $row = $query->first();
            if (! $row && $request->boolean('single')) {
                return response()->json(['error' => 'Запись не найдена'], 404);
            }
            return $this->rawJsonResponse([
                'data'  => $row ? $this->castRawRow($row, $instance) : null,
                'count' => $count,
            ]);
        }

        // Важно: не вызываем get() даже с limit=501. Для таблиц с широкими
        // JSON-полями PDO + Collection материализуют всю выборку до того, как
        // сработает байтовый бюджет, и PHP успевает упасть по memory_limit.
        // Читаем небольшими SQL-порциями; прекращение цикла прекращает и
        // последующие запросы к БД. Не используем lazy(): Query Builder требует
        // обязательный orderBy, а универсальный bridge поддерживает запросы без него.
        $wantedRows = $probe ? $limit + 1 : $limit;
        $truncated = false;
        $bytes = 0;
        $data = [];
        $fetched = 0;
        while ($fetched < $wantedRows) {
            $chunkSize = min(self::RAW_CHUNK_ROWS, $wantedRows - $fetched);
            $chunk = (clone $query)
                ->offset($baseOffset + $fetched)
                ->limit($chunkSize)
                ->get();
            if ($chunk->isEmpty()) {
                break;
            }

            foreach ($chunk as $row) {
                $fetched++;
                $cast = $this->castRawRow($row, $instance);
                $rowBytes = strlen(json_encode($cast, JSON_UNESCAPED_UNICODE) ?: '');

                if (count($data) >= $limit || ($data && $bytes + $rowBytes > self::RAW_RESPONSE_BYTES)) {
                    $truncated = true;
                    break 2;
                }

                $data[] = $cast;
                $bytes += $rowBytes;
                // Одна строка сама может быть больше бюджета. Оставляем её для
                // совместимости, но не читаем ни одной следующей строки.
                if ($bytes >= self::RAW_RESPONSE_BYTES) {
                    $truncated = true;
                    break 2;
                }
            }

            $received = $chunk->count();
            unset($chunk);
            if ($received < $chunkSize) {
                break;
            }
        }

        if ($truncated) {
            \Illuminate\Support\Facades\Log::warning('db_index_truncated', [
                'table' => $table,
                'query' => $request->getQueryString(),
                'rows'  => count($data),
                'bytes' => $bytes,
                'user'  => optional($request->user())->getAuthIdentifier(),
            ]);
        }

        return $this->rawJsonResponse([
            'data'      => $data,
            'count'     => $count,
            'truncated' => $truncated,
        ]);
    }

    /** Маркеры позволяют по Network сразу доказать, какой backend-код отвечает. */
    private function rawJsonResponse(array $payload)
    {
        return response()->json($payload)
            ->header('X-App-Version', \App\Support\AppVersion::current())
            ->header('X-Db-Read-Path', 'raw-chunked-v4');
    }

    /** Повторяет поведение CompanyScope для сырого query builder. */
    private function applyCompanyScope($query, $instance, string $tableName, array $columns): void
    {
        $user = auth()->user();
        if (! $user) {
            return;
        }
        if (method_exists($user, 'hasRole') && $user->hasRole('superadmin')) {
            return;
        }
        $impersonator = method_exists($user, 'getAttribute') ? $user->getAttribute('impersonator') : null;
        if ($impersonator && method_exists($impersonator, 'hasRole') && $impersonator->hasRole('superadmin')) {
            return;
        }
        if (! in_array('company_id', $columns, true)) {
            return;
        }
        $companyId = method_exists($user, 'companyId') ? $user->companyId() : null;
        if (! $companyId) {
            $query->whereRaw('1 = 0');
            return;
        }
        $query->where($tableName . '.company_id', $companyId);
    }

    /**
     * Построчные ограничения, которые нельзя выразить одним company_id.
     * Сейчас это персональные HR-документы: сотрудник видит только свои,
     * общие регламенты компании (owner_user_id IS NULL) видны всем.
     */
    private function applyRowLevelScope($query, string $tableName, array $columns): void
    {
        $user = auth()->user();
        if (! $user) {
            return;
        }
        $impersonator = method_exists($user, 'getAttribute') ? $user->getAttribute('impersonator') : null;
        if ((method_exists($user, 'hasRole') && $user->hasRole('superadmin'))
            || ($impersonator && method_exists($impersonator, 'hasRole') && $impersonator->hasRole('superadmin'))) {
            return;
        }
        if ($tableName === 'shop_order_items' && in_array('order_id', $columns, true)) {
            $domainUserId = method_exists($user, 'domainUserId') ? $user->domainUserId() : $user->id;
            $companyId = method_exists($user, 'companyId') ? $user->companyId() : null;
            $isStaff = method_exists($user, 'hasRole') && $user->hasRole(['company_admin', 'hrd', 'hr']);

            $query->whereExists(function ($sub) use ($tableName, $domainUserId, $companyId, $isStaff) {
                $sub->selectRaw('1')
                    ->from('shop_orders')
                    ->whereColumn('shop_orders.id', $tableName . '.order_id');
                if ($isStaff) {
                    if (! $companyId) {
                        $sub->whereRaw('1 = 0');
                    } else {
                        $sub->where('shop_orders.company_id', (string) $companyId);
                    }
                } else {
                    $sub->where('shop_orders.user_id', (string) $domainUserId);
                }
            });
            return;
        }
        if (method_exists($user, 'hasRole')
            && $user->hasRole(['superadmin', 'company_admin', 'hrd', 'hr'])) {
            return;
        }
        if ($tableName === 'hr_documents' && in_array('owner_user_id', $columns, true)) {
            $isManager = method_exists($user, 'hasRole') && $user->hasRole('manager');
            $teamIds = $isManager
                ? \App\Models\TeamMember::query()->withoutGlobalScopes()
                    ->where('manager_id', $user->id)->pluck('employee_id')
                    ->map(fn ($id) => (string) $id)->all()
                : [];

            $query->where(function ($q) use ($tableName, $user, $teamIds) {
                $q->whereNull($tableName . '.owner_user_id')
                  ->orWhere($tableName . '.owner_user_id', (string) $user->id);
                if ($teamIds !== []) {
                    $q->orWhereIn($tableName . '.owner_user_id', $teamIds);
                }
            });
            return;
        }

        if (in_array($tableName, ['test_attempts', 'shop_cart_items', 'shop_orders'], true)
            && in_array('user_id', $columns, true)) {
            $domainUserId = method_exists($user, 'domainUserId') ? $user->domainUserId() : $user->id;
            $query->where($tableName . '.user_id', (string) $domainUserId);
        }
    }

    /**
     * Приводит сырую строку к тому же виду, что отдавал Eloquent: JSON-колонки
     * декодируются, boolean/числа приводятся к нативным типам.
     */
    private function castRawRow($row, $instance): array
    {
        $out = (array) $row;
        $casts = method_exists($instance, 'getCasts') ? $instance->getCasts() : [];
        foreach ($out as $col => $value) {
            $cast = $casts[$col] ?? null;
            if ($value === null || $cast === null) {
                continue;
            }
            if (in_array($cast, ['array', 'json', 'object', 'collection'], true)) {
                $out[$col] = is_string($value) ? json_decode($value, true) : $value;
            } elseif (in_array($cast, ['bool', 'boolean'], true)) {
                $out[$col] = (bool) $value;
            } elseif (in_array($cast, ['int', 'integer'], true)) {
                $out[$col] = (int) $value;
            } elseif (in_array($cast, ['float', 'double', 'real'], true)) {
                $out[$col] = (float) $value;
            } elseif (str_starts_with($cast, 'decimal:')) {
                $out[$col] = (float) $value;
            }
        }
        return $out;
    }


    private function isDatabaseBusy(\Illuminate\Database\QueryException $e): bool
    {
        return (bool) preg_match(
            '/max_user_connections|max_connections_per_hour|Too many connections|too many clients|SQLSTATE\[0800[46]\]|server has gone away|Connection refused/i',
            $e->getMessage(),
        );
    }

    /**
     * Сырой COUNT(*) для head-запросов. Никогда не отдаёт 500: при любой
     * проблеме возвращает count = null и флаг degraded, чтобы бейджи/счётчики
     * в интерфейсе не роняли экран.
     */
    private function headCount(Request $request, string $model, string $table)
    {
        try {
            /** @var \Illuminate\Database\Eloquent\Model $instance */
            $instance = new $model();
            $tableName = $instance->getTable();
            $columns = self::HOT_TABLE_COLUMNS[$tableName]
                ?? \Illuminate\Support\Facades\Schema::getColumnListing($tableName);
            $query = \Illuminate\Support\Facades\DB::table($tableName);
            $this->applyFilters($query, $request);
            $this->applyCompanyScope($query, $instance, $tableName, $columns);
            $this->applyRowLevelScope($query, $tableName, $columns);

            return response()->json(['data' => [], 'count' => (int) $query->count()]);
        } catch (\Illuminate\Database\QueryException $e) {
            if ($this->isDatabaseBusy($e)) {
                throw $e; // отдаст RetryOnDbBusy → 503 db_busy
            }
            \Illuminate\Support\Facades\Log::warning('db_head_count_failed', [
                'table' => $table, 'msg' => $e->getMessage(),
            ]);
            return response()->json(['data' => [], 'count' => null, 'degraded' => true]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('db_head_count_failed', [
                'table' => $table, 'msg' => $e->getMessage(),
            ]);
            return response()->json(['data' => [], 'count' => null, 'degraded' => true]);
        }
    }




    public function store(Request $request, string $table)
    {
        $this->enforceResourceAccess($request, $table, 'edit');
        $model = self::resolve($table);
        $payload = $request->input('values', $request->all());
        $rows = isset($payload[0]) ? $payload : [$payload];
        if ($table === 'portal_posts') {
            foreach ($rows as &$row) {
                if (array_key_exists('body_md', $row)) $row['body_md'] = \App\Support\RichTextSanitizer::clean($row['body_md']);
            }
            unset($row);
        }
        if ($table === 'shop_cart_items') {
            $user = $request->user();
            $isStaff = $user && method_exists($user, 'hasRole') && $user->hasRole(['superadmin', 'company_admin', 'hrd', 'hr']);
            if ($user && ! $isStaff) {
                $domainUserId = method_exists($user, 'domainUserId') ? $user->domainUserId() : $user->id;
                $companyId = method_exists($user, 'companyId') ? $user->companyId() : null;
                foreach ($rows as &$row) {
                    $row['user_id'] = (string) $domainUserId;
                    if ($companyId) {
                        $row['company_id'] = (string) $companyId;
                    }
                }
                unset($row);
            }
        }
        $upsert = $request->boolean('upsert');
        $onConflict = $request->input('onConflict');

        $created = [];
        try {
            foreach ($rows as $row) {
                $instance = null;
                if ($upsert && $onConflict && isset($row[$onConflict])) {
                    $instance = $model::query()->where($onConflict, $row[$onConflict])->first();
                }
                if (! $instance) {
                    $instance = new $model();
                    $instance->fill($row);
                    $this->authorizeAny('create', $instance);
                } else {
                    $this->authorizeAny('update', $instance);
                    $instance->fill($row);
                }
                $instance->save();
                $created[] = $instance->fresh();
            }
        } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) {
            throw $e;
        } catch (\Illuminate\Database\QueryException $e) {
            if ($this->isDatabaseBusy($e)) {
                throw $e;
            }
            \Illuminate\Support\Facades\Log::warning('DbController insert failed', [
                'table' => $table, 'sqlstate' => $e->getCode(), 'msg' => $e->getMessage(),
            ]);
            return response()->json([
                'error' => 'Не удалось сохранить запись',
                'details' => $e->getMessage(),
                'sqlstate' => $e->getCode(),
            ], 422);
        } catch (\Throwable $e) {
            return $this->serverError('db_store_failed', $table, $request, $e);
        }


        return response()->json(['data' => count($created) === 1 ? $created[0] : $created]);
    }

    public function update(Request $request, string $table)
    {
        try {
            $this->enforceResourceAccess($request, $table, 'edit');
            $model = self::resolve($table);
            $query = $model::query();
            $applied = $this->applyFilters($query, $request);
            $this->applyRowLevelScope(
                $query,
                (new $model())->getTable(),
                \Illuminate\Support\Facades\Schema::getColumnListing((new $model())->getTable()),
            );
            $values = $request->input('values', []);
            if ($table === 'portal_posts' && array_key_exists('body_md', $values)) {
                $values['body_md'] = \App\Support\RichTextSanitizer::clean($values['body_md']);
            }
            if (! $values) {
                return response()->json(['error' => 'Нет данных для обновления'], 422);
            }
            if ($applied === 0 || empty($query->getQuery()->wheres)) {
                \Illuminate\Support\Facades\Log::warning('DbController mass update blocked', [
                    'table' => $table, 'query' => $request->server('QUERY_STRING'),
                ]);
                return response()->json([
                    'error' => 'Отказ: массовое обновление без фильтров запрещено',
                    'code'  => 'mass_mutation_blocked',
                ], 422);
            }
            $rows = $query->get();
            if ($rows->isEmpty()) {
                // Строка может существовать, но быть отфильтрована company-scope.
                // Тогда это попытка доступа к чужой компании → 403, а не «тихий» 200.
                $foreign = $model::query()->withoutGlobalScopes();
                $this->applyFilters($foreign, $request);
                $other = $foreign->first();
                if ($other) {
                    $this->authorizeAny('update', $other);
                }
            }
            foreach ($rows as $row) {
                $this->authorizeAny('update', $row);
                $row->fill($values);
                $row->save();
            }
            return response()->json(['data' => $rows->fresh()]);
        } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) {
            throw $e;
        } catch (\Illuminate\Database\QueryException $e) {
            if ($this->isDatabaseBusy($e)) {
                throw $e;
            }
            \Illuminate\Support\Facades\Log::warning('DbController update failed', [
                'table' => $table, 'sqlstate' => $e->getCode(), 'msg' => $e->getMessage(),
            ]);
            return response()->json([
                'error' => 'Не удалось сохранить изменения',
                'details' => $e->getMessage(),
                'sqlstate' => $e->getCode(),
            ], 422);
        } catch (\Throwable $e) {
            return $this->serverError('db_update_failed', $table, $request, $e);
        }
    }

    public function destroy(Request $request, string $table)
    {
        try {
            $this->enforceResourceAccess($request, $table, 'edit');
            $model = self::resolve($table);
            $query = $model::query();
            $applied = $this->applyFilters($query, $request);
            $this->applyRowLevelScope(
                $query,
                (new $model())->getTable(),
                \Illuminate\Support\Facades\Schema::getColumnListing((new $model())->getTable()),
            );
            if ($applied === 0 || empty($query->getQuery()->wheres)) {
                \Illuminate\Support\Facades\Log::warning('DbController mass delete blocked', [
                    'table' => $table, 'query' => $request->server('QUERY_STRING'),
                ]);
                return response()->json([
                    'error' => 'Отказ: массовое удаление без фильтров запрещено',
                    'code'  => 'mass_mutation_blocked',
                ], 422);
            }
            // Extra safeguard for high-blast-radius tables: require an explicit id filter.
            $requireIdFilter = ['companies'];
            if (in_array($table, $requireIdFilter, true)) {
                $hasIdFilter = false;
                foreach ($query->getQuery()->wheres as $w) {
                    if (($w['column'] ?? null) === 'id') { $hasIdFilter = true; break; }
                }
                if (! $hasIdFilter) {
                    return response()->json([
                        'error' => "Отказ: удаление из '$table' требует фильтр по id",
                        'code'  => 'id_filter_required',
                    ], 422);
                }
            }
            $rows = $query->get();
            if ($rows->isEmpty()) {
                $foreign = $model::query()->withoutGlobalScopes();
                $this->applyFilters($foreign, $request);
                $other = $foreign->first();
                if ($other) {
                    $this->authorizeAny('delete', $other);
                }
            }
            foreach ($rows as $row) {
                $this->authorizeAny('delete', $row);
                $row->delete();
            }
            return response()->json(['data' => ['deleted' => $rows->count()]]);
        } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) {
            throw $e;
        } catch (\Illuminate\Database\QueryException $e) {
            if ($this->isDatabaseBusy($e)) {
                throw $e;
            }
            \Illuminate\Support\Facades\Log::warning('DbController delete failed', [
                'table' => $table, 'sqlstate' => $e->getCode(), 'msg' => $e->getMessage(),
            ]);
            return response()->json([
                'error' => 'Не удалось удалить запись',
                'details' => $e->getMessage(),
                'sqlstate' => $e->getCode(),
            ], 422);
        } catch (\Throwable $e) {
            return $this->serverError('db_destroy_failed', $table, $request, $e);
        }
    }


    /** ---- helpers ---- */

    protected static function resolve(string $table): string
    {
        if (! isset(self::MODEL_MAP[$table])) {
            abort(response()->json(['error' => "Таблица '$table' недоступна"], 404));
        }
        return self::MODEL_MAP[$table];
    }

    /**
     * Parse filter params from the RAW query string. PHP replaces '.' with '_'
     * inside $_GET keys (legacy register_globals behaviour), so relying on
     * $request->query() would silently drop `eq.id`, `ilike.name`, etc. and
     * turn a filtered DELETE into a mass-delete. Return the number of filters
     * applied so callers can enforce "no filter → no mutation" guards.
     */
    protected function applyFilters($query, Request $request): int
    {
        $raw = (string) $request->server('QUERY_STRING');
        if ($raw === '') return 0;

        $pairs = [];
        foreach (explode('&', $raw) as $chunk) {
            if ($chunk === '') continue;
            [$k, $v] = array_pad(explode('=', $chunk, 2), 2, '');
            $key = urldecode($k);
            $val = urldecode($v);
            $pairs[] = [$key, $val];
        }

        $applied = 0;
        foreach ($pairs as [$key, $value]) {
            $op = null;
            $col = null;
            if (str_contains($key, '.')) {
                [$op, $col] = explode('.', $key, 2);
            } elseif (str_contains($value, '.')) {
                [$op, $value] = explode('.', $value, 2);
                $col = $key;
            }
            if (! $op || ! $col) continue;
            // Guard against empty values that would otherwise expand to
            // `where col = ''` and quietly match nothing (or, for text cols,
            // everything on some ORMs). Treat as "no filter applied".
            if ($value === '' && $op !== 'is') continue;

            if ($op === 'in') {
                $value = trim($value);
                if (str_starts_with($value, '(') && str_ends_with($value, ')')) {
                    $value = substr($value, 1, -1);
                }
                $items = array_values(array_filter(explode(',', $value), fn ($x) => $x !== ''));
                if (! $items) continue;
                $query->whereIn($col, $items);
                $applied++;
            } elseif ($op === 'is') {
                $value === 'null' ? $query->whereNull($col) : $query->whereNotNull($col);
                $applied++;
            } elseif (isset(self::OPS[$op])) {
                $query->where($col, self::OPS[$op], $this->normalizeFilterValue($op, $value));
                $applied++;
            }
        }
        return $applied;
    }

    /**
     * Клиент (PostgREST-совместимый слой) шлёт булевы значения как `true`/`false`.
     * MySQL хранит их в tinyint(1) и приводит строку 'true' к 0 — из-за этого
     * `shop_products?eq.is_active=true` возвращал пустой список при живых товарах.
     * Приводим литералы к 1/0 для операторов сравнения (like/ilike не трогаем).
     */
    protected function normalizeFilterValue(string $op, string $value): string
    {
        if ($op === 'like' || $op === 'ilike') {
            return $value;
        }
        $lower = strtolower($value);
        if ($lower === 'true')  return '1';
        if ($lower === 'false') return '0';
        return $value;
    }


    protected function applySelect($query, Request $request): void
    {
        if (! $request->filled('select')) return;
        // PostgREST-style: "col1, col2, alias:relation(col_a, col_b), rel2(*)"
        // Split on commas at depth 0 only (parentheses preserve nesting).
        $raw = (string) $request->query('select');
        $parts = $this->splitTopLevel($raw, ',');
        $cols = [];
        $eager = [];
        $skipped = [];
        $model = method_exists($query, 'getModel') ? $query->getModel() : null;
        foreach ($parts as $part) {
            $p = trim($part);
            if ($p === '' || $p === '*') continue;
            if (preg_match('/^([A-Za-z0-9_]+)(?::([A-Za-z0-9_]+))?\((.*)\)$/', $p, $m)) {
                // PostgREST syntax is usually alias:table(cols), while Eloquent
                // needs the model relation method. In this codebase aliases are
                // the relation names: product:shop_products(*) -> product().
                $alias    = $m[2] !== '' ? $m[1] : null;
                $requested = $m[2] !== '' ? $m[2] : $m[1];
                $relation = $alias ?: $requested;
                $inner    = trim($m[3]);
                // Рассинхрон фронта и моделей не должен ронять сервис в 500:
                // неизвестную связь просто пропускаем и пишем предупреждение.
                if ($model && ! method_exists($model, $relation)) {
                    $skipped[] = $requested;
                    continue;
                }
                if ($inner === '' || $inner === '*') {
                    $eager[] = $relation;
                } else {
                    $innerCols = array_filter(array_map('trim', explode(',', $inner)));
                    $eager[$relation] = function ($q) use ($innerCols) {
                        $q->select(array_merge(['id'], $innerCols));
                    };
                }
            } else {
                $cols[] = $p;
            }
        }
        if ($skipped) {
            \Illuminate\Support\Facades\Log::warning('db_select_unknown_relation', [
                'table'     => $request->route('table') ?? $request->path(),
                'relations' => $skipped,
            ]);
        }
        if ($cols) $query->select($cols);
        if ($eager) $query->with($eager);

    }

    protected function splitTopLevel(string $s, string $sep): array
    {
        $out = [];
        $buf = '';
        $depth = 0;
        for ($i = 0, $n = strlen($s); $i < $n; $i++) {
            $c = $s[$i];
            if ($c === '(') { $depth++; $buf .= $c; continue; }
            if ($c === ')') { $depth--; $buf .= $c; continue; }
            if ($c === $sep && $depth === 0) { $out[] = $buf; $buf = ''; continue; }
            $buf .= $c;
        }
        if ($buf !== '') $out[] = $buf;
        return $out;
    }

    /**
     * @param array|null $columns Реальные колонки таблицы. Если переданы,
     *  сортировка по неизвестной колонке игнорируется — устаревший клиент не
     *  должен ронять запрос SQL-ошибкой.
     */
    protected function applyOrder($query, Request $request, ?array $columns = null): void
    {
        if (! $request->filled('order')) return;
        foreach (explode(',', (string) $request->query('order')) as $part) {
            [$col, $dir] = array_pad(explode('.', trim($part), 2), 2, 'asc');
            $col = trim($col);
            if ($col === '') continue;
            if ($columns !== null && ! in_array($col, $columns, true)) continue;
            $query->orderBy($col, strtolower($dir) === 'desc' ? 'desc' : 'asc');
        }
    }

    protected function authorizeAny(string $ability, $modelOrClass): void
    {
        if (Gate::allows($ability, $modelOrClass)) {
            return;
        }

        $user = auth()->user();
        $modelClass = is_object($modelOrClass) ? get_class($modelOrClass) : (string) $modelOrClass;

        $diagnostics = [
            'ability'    => $ability,
            'model'      => $modelClass,
            'user_id'    => $user?->id,
            'email'      => $user?->email,
            'company_id' => $user?->companyId(),
            'roles'      => $user
                ? \Illuminate\Support\Facades\DB::table('user_roles')
                    ->where('user_id', $user->id)->pluck('role')->all()
                : [],
            'is_verified' => $user?->isVerified(),
        ];

        \Illuminate\Support\Facades\Log::warning('Authorization denied', $diagnostics);

        abort(response()->json([
            'error'   => 'Недостаточно прав',
            'details' => $diagnostics,
        ], 403));
    }

    private function enforceResourceAccess(Request $request, string $table, string $action): void
    {
        if (in_array($action, self::SELF_SERVICE_TABLE_ACTIONS[$table] ?? [], true)) {
            return; // личные данные: решают политики моделей
        }
        try {
            $resource = self::TABLE_RESOURCES[$table] ?? null;
            $denied = $resource && ! AccessControlController::allows($request->user(), $resource, $action);
        } catch (\Throwable $e) {
            report($e);
            return; // ролевая модель не должна превращаться в 500
        }
        if ($denied) {
            abort(response()->json(['error' => 'Доступ к разделу запрещён ролевой моделью', 'resource' => $resource], 403));
        }
    }

}
