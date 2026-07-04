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
        'competencies'             => \App\Models\Competency::class,
        'currency_balances'        => \App\Models\CurrencyBalance::class,
        'currency_transactions'    => \App\Models\CurrencyTransaction::class,
        'company_currency_settings' => \App\Models\CompanyCurrencySettings::class,
        'company_onboarding_settings' => \App\Models\CompanyOnboardingSettings::class,
        'demo_requests'            => \App\Models\DemoRequest::class,
        'employee_invitations'     => \App\Models\EmployeeInvitation::class,
        'employee_questionnaires'  => \App\Models\EmployeeQuestionnaire::class,
        'employee_rewards'         => \App\Models\EmployeeReward::class,
        'employee_risk_scores'     => \App\Models\EmployeeRiskScore::class,
        'gamification_reward_types' => \App\Models\GamificationRewardType::class,
        'hr_documents'             => \App\Models\HrDocument::class,
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


    protected const OPS = [
        'eq' => '=', 'neq' => '!=',
        'gt' => '>', 'gte' => '>=',
        'lt' => '<', 'lte' => '<=',
        'like' => 'like', 'ilike' => 'ilike',
    ];

    public function index(Request $request, string $table)
    {
        $model = self::resolve($table);
        $this->authorizeAny('viewAny', $model);

        try {
            $query = $model::query();
            $this->applyFilters($query, $request);
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

            if ($request->filled('range')) {
                [$from, $to] = array_map('intval', explode('-', $request->query('range')));
                $query->skip($from)->take(max(1, $to - $from + 1));
            } elseif ($request->filled('limit')) {
                $query->take(min(1000, (int) $request->query('limit')));
            }

            if ($request->boolean('single') || $request->boolean('maybeSingle')) {
                $row = $query->first();
                if (! $row && $request->boolean('single')) {
                    return response()->json(['error' => 'Запись не найдена'], 404);
                }
                return response()->json(['data' => $row, 'count' => $count]);
            }

            return response()->json(['data' => $query->get(), 'count' => $count]);
        } catch (\Illuminate\Database\QueryException $e) {
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
        }
    }


    public function store(Request $request, string $table)
    {
        $model = self::resolve($table);
        $payload = $request->input('values', $request->all());
        $rows = isset($payload[0]) ? $payload : [$payload];
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
        } catch (\Illuminate\Database\QueryException $e) {
            \Illuminate\Support\Facades\Log::warning('DbController insert failed', [
                'table' => $table, 'sqlstate' => $e->getCode(), 'msg' => $e->getMessage(),
            ]);
            return response()->json([
                'error' => 'Не удалось сохранить запись',
                'details' => $e->getMessage(),
                'sqlstate' => $e->getCode(),
            ], 422);
        }

        return response()->json(['data' => count($created) === 1 ? $created[0] : $created]);
    }

    public function update(Request $request, string $table)
    {
        $model = self::resolve($table);
        $query = $model::query();
        $applied = $this->applyFilters($query, $request);
        $values = $request->input('values', []);
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
        foreach ($rows as $row) {
            $this->authorizeAny('update', $row);
            $row->fill($values);
            $row->save();
        }
        return response()->json(['data' => $rows->fresh()]);
    }

    public function destroy(Request $request, string $table)
    {
        $model = self::resolve($table);
        $query = $model::query();
        $applied = $this->applyFilters($query, $request);
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
        foreach ($rows as $row) {
            $this->authorizeAny('delete', $row);
            $row->delete();
        }
        return response()->json(['data' => ['deleted' => $rows->count()]]);
    }

    /** ---- helpers ---- */

    protected static function resolve(string $table): string
    {
        if (! isset(self::MODEL_MAP[$table])) {
            abort(response()->json(['error' => "Таблица '$table' недоступна"], 404));
        }
        return self::MODEL_MAP[$table];
    }

    protected function applyFilters($query, Request $request): void
    {
        foreach ($request->query() as $key => $value) {
            if (! str_contains($key, '.')) continue;
            [$op, $col] = explode('.', $key, 2);
            if ($op === 'in') {
                $query->whereIn($col, array_filter(explode(',', (string) $value)));
            } elseif ($op === 'is') {
                $value === 'null' ? $query->whereNull($col) : $query->whereNotNull($col);
            } elseif (isset(self::OPS[$op])) {
                $query->where($col, self::OPS[$op], $value);
            }
        }
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
        foreach ($parts as $part) {
            $p = trim($part);
            if ($p === '' || $p === '*') continue;
            if (preg_match('/^([A-Za-z0-9_]+)(?::([A-Za-z0-9_]+))?\((.*)\)$/', $p, $m)) {
                // alias:relation(cols)  OR  relation(cols)
                $alias    = $m[2] !== '' ? $m[1] : null;
                $relation = $m[2] !== '' ? $m[2] : $m[1];
                $inner    = trim($m[3]);
                $key = $alias ? "$alias as $relation" : $relation;
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

    protected function applyOrder($query, Request $request): void
    {
        if (! $request->filled('order')) return;
        foreach (explode(',', (string) $request->query('order')) as $part) {
            [$col, $dir] = array_pad(explode('.', trim($part), 2), 2, 'asc');
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
}
