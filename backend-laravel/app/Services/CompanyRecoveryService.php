<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CompanyRecoveryService
{
    private const COMPANY_ID_TABLES = [
        'profiles', 'departments', 'positions', 'team_members',
        'comfort_scores', 'comfort_signal_events', 'initiative_votes', 'initiatives',
        'employee_risk_scores', 'peer_recognitions', 'peer_recognition_reactions',
        'achievements', 'employee_rewards', 'gamification_reward_types',
        'notifications', 'test_attempts', 'closed_question_tests',
        'career_step_submission_files', 'career_step_submissions', 'career_goals',
        'employee_career_assignments', 'career_track_templates', 'career_step_scenarios',
        'shop_cart_items', 'shop_order_items', 'shop_orders', 'shop_products',
        'hr_task_assignees', 'hr_tasks', 'hr_documents', 'employee_questionnaires',
        'competencies', 'assessments', 'assessment_scenarios', 'currency_transactions',
        'currency_balances', 'company_currency_settings', 'company_onboarding_settings',
        'employee_invitations', 'support_tickets', 'chat_conversations',
        'tracker_projects', 'tracker_okr_periods', 'tracker_goals', 'tracker_key_results',
        'tracker_tasks', 'tracker_task_checkins', 'tracker_one_on_ones', 'tracker_audit_log',
        'tracker_workflows', 'tracker_workflow_statuses', 'tracker_workflow_transitions',
        'tracker_sprints', 'onboarding_plans', 'onboarding_plan_steps', 'onboarding_assignments',
        'onboarding_step_progress', 'individual_development_plans', 'idp_items',
        'knowledge_categories', 'knowledge_articles', 'performance_review_reviewers',
        'portal_posts', 'portal_post_reactions', 'portal_post_comments', 'portal_communities',
        'portal_community_members', 'pulse_surveys', 'pulse_survey_questions', 'pulse_survey_responses',
        'webhook_subscriptions', 'webhook_deliveries', 'leave_requests', 'leave_balances',
        'leave_compensations', 'leave_types',
    ];

    private const KNOWN_COMPANY_NAMES = [
        'a0000000-0000-0000-0000-000000000001' => 'Компания (по умолчанию)',
        '1dcfe3f1-5edc-445c-867d-5d58806510df' => 'ИП Рубан',
    ];

    public function missingCompanyIds(bool $includeDemoOrphans = true): array
    {
        $referenced = $this->referencedCompanyIds();
        $existing = Schema::hasTable('companies')
            ? DB::table('companies')->pluck('id')->map(fn ($id) => (string) $id)->all()
            : [];

        $missing = array_values(array_diff($referenced, $existing));
        if (! $includeDemoOrphans) {
            $missing = array_values(array_filter($missing, fn (string $id) => ! $this->isDemoOnlyCompany($id)));
        }

        sort($missing);
        return $missing;
    }

    public function recoverMissingCompanies(bool $apply, ?string $singleName = null, bool $includeDemoOrphans = false): array
    {
        $missing = $this->missingCompanyIds($includeDemoOrphans);
        $rows = [];

        foreach ($missing as $id) {
            $summary = $this->summarize($id);
            $name = count($missing) === 1 && $singleName
                ? $singleName
                : $this->inferName($id, $summary);

            $row = [
                'id' => $id,
                'name' => $name,
                'description' => 'Восстановлено автоматически: строка companies была удалена, но связанные данные с этим company_id сохранились.',
                'logo_url' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ];

            if ($apply) {
                DB::table('companies')->insertOrIgnore($row);
            }

            $rows[] = array_merge($summary, [
                'id' => $id,
                'name' => $name,
                'status' => $apply ? 'recovered' : 'dry-run',
            ]);
        }

        return [
            'apply' => $apply,
            'missing_count' => count($missing),
            'companies' => $rows,
        ];
    }

    public function referencedCompanyIds(): array
    {
        $ids = [];
        foreach (self::COMPANY_ID_TABLES as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'company_id')) {
                continue;
            }

            DB::table($table)
                ->whereNotNull('company_id')
                ->distinct()
                ->pluck('company_id')
                ->each(function ($id) use (&$ids) {
                    $id = trim((string) $id);
                    if ($id !== '') $ids[$id] = true;
                });
        }

        $this->collectUserMetaCompanyIds($ids);

        $out = array_keys($ids);
        sort($out);
        return $out;
    }

    private function collectUserMetaCompanyIds(array &$ids): void
    {
        if (! Schema::hasTable('users') || ! Schema::hasColumn('users', 'meta')) {
            return;
        }

        DB::table('users')
            ->whereNotNull('meta')
            ->select(['id', 'meta'])
            ->orderBy('id')
            ->chunk(500, function ($users) use (&$ids) {
                foreach ($users as $user) {
                    $meta = is_string($user->meta) ? json_decode($user->meta, true) : (array) $user->meta;
                    $companyId = is_array($meta) ? trim((string) ($meta['company_id'] ?? '')) : '';
                    if ($companyId !== '') $ids[$companyId] = true;
                }
            });
    }

    private function summarize(string $companyId): array
    {
        $profiles = $this->countByCompany('profiles', $companyId);
        return [
            'profiles' => $profiles,
            'demo_profiles' => $this->countDemoProfiles($companyId),
            'departments' => $this->countByCompany('departments', $companyId),
            'positions' => $this->countByCompany('positions', $companyId),
            'tasks' => $this->countByCompany('hr_tasks', $companyId),
        ];
    }

    private function inferName(string $companyId, array $summary): string
    {
        if (isset(self::KNOWN_COMPANY_NAMES[$companyId])) {
            return self::KNOWN_COMPANY_NAMES[$companyId];
        }

        $domain = $this->firstNonDemoEmailDomain($companyId);
        if ($domain) {
            return 'Восстановленная компания ' . $domain;
        }

        return 'Восстановленная компания ' . substr($companyId, 0, 8);
    }

    private function countByCompany(string $table, string $companyId): int
    {
        if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'company_id')) return 0;
        return DB::table($table)->where('company_id', $companyId)->count();
    }

    private function countDemoProfiles(string $companyId): int
    {
        if (! Schema::hasTable('profiles') || ! Schema::hasTable('users')) return 0;
        return DB::table('profiles')
            ->join('users', 'users.id', '=', 'profiles.user_id')
            ->where('profiles.company_id', $companyId)
            ->where('users.email', 'like', '%@demo.pikrosta.ru')
            ->count();
    }

    private function isDemoOnlyCompany(string $companyId): bool
    {
        $profiles = $this->countByCompany('profiles', $companyId);
        return $profiles > 0 && $profiles === $this->countDemoProfiles($companyId);
    }

    private function firstNonDemoEmailDomain(string $companyId): ?string
    {
        if (! Schema::hasTable('profiles') || ! Schema::hasTable('users')) return null;

        $email = DB::table('profiles')
            ->join('users', 'users.id', '=', 'profiles.user_id')
            ->where('profiles.company_id', $companyId)
            ->where('users.email', 'not like', '%@demo.pikrosta.ru')
            ->where('users.email', 'like', '%@%')
            ->orderBy('users.email')
            ->value('users.email');

        if (! is_string($email) || ! str_contains($email, '@')) return null;
        return strtolower(substr(strrchr($email, '@'), 1));
    }
}