<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Generic table CRUD bridge (Phase 10).
 *
 * Drop-in replacement for `supabase.from(table).select().eq()...`.
 *
 * Query string filters (compatible with PostgREST conventions used by the
 * supabase-js client):
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

        $query = $model::query();
        $this->applyFilters($query, $request);
        $this->applySelect($query, $request);
        $this->applyOrder($query, $request);

        // count + head (Supabase: .select('id', { count: 'exact', head: true }))
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
    }

    public function store(Request $request, string $table)
    {
        $model = self::resolve($table);
        $payload = $request->input('values', $request->all());
        $rows = isset($payload[0]) ? $payload : [$payload];
        $upsert = $request->boolean('upsert');
        $onConflict = $request->input('onConflict');

        $created = [];
        foreach ($rows as $row) {
            $instance = null;
            if ($upsert && $onConflict && isset($row[$onConflict])) {
                $instance = $model::query()->where($onConflict, $row[$onConflict])->first();
            }
            if (! $instance) {
                $instance = new $model();
                $this->authorizeAny('create', $instance);
            } else {
                $this->authorizeAny('update', $instance);
            }
            $instance->fill($row);
            $instance->save();
            $created[] = $instance->fresh();
        }

        return response()->json(['data' => count($created) === 1 ? $created[0] : $created]);
    }

    public function update(Request $request, string $table)
    {
        $model = self::resolve($table);
        $query = $model::query();
        $this->applyFilters($query, $request);
        $values = $request->input('values', []);
        if (! $values) {
            return response()->json(['error' => 'Нет данных для обновления'], 422);
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
        $this->applyFilters($query, $request);
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
        if (! Gate::allows($ability, $modelOrClass)) {
            abort(response()->json(['error' => 'Недостаточно прав'], 403));
        }
    }
}
