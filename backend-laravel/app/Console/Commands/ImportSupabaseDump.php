<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Импорт JSON-дампов из Supabase в MySQL.
 *
 * Использование:
 *   php artisan supabase:import /var/www/supabase-migration/data
 *
 * Файлы:
 *   <dir>/<table>.json    — массив объектов (по одному на таблицу)
 *   <dir>/_auth_users.json — выгрузка из auth.users (id, email, encrypted_password, raw_user_meta_data, ...)
 *
 * Идемпотентно (upsert по `id` или `email`). FK-порядок зафиксирован в TABLE_ORDER.
 */
class ImportSupabaseDump extends Command
{
    protected $signature = 'supabase:import {dir : Каталог с JSON-дампами} {--truncate : Очистить таблицы перед импортом}';
    protected $description = 'Импорт данных из Supabase JSON-дампа в MySQL';

    /** Порядок импорта (учитывает FK) */
    protected const TABLE_ORDER = [
        // Core
        'companies',
        'users', // из _auth_users.json
        'profiles',
        'user_roles',
        'departments',
        'positions',
        'position_career_paths',

        // Career
        'career_track_templates',
        'career_step_scenarios',
        'career_level_actions',
        'employee_career_assignments',
        'career_step_submissions',
        'career_step_submission_files',
        'career_goals',
        'goal_checklist_items',

        // HR
        'hr_documents',
        'hr_tasks',
        'hr_task_assignees',
        'team_members',
        'employee_invitations',
        'email_domain_position_mappings',

        // Assessments
        'assessment_scenarios',
        'assessments',
        'closed_question_tests',
        'test_attempts',
        'competencies',
        'employee_questionnaires',
        'employee_questionnaire_files',
        'employee_risk_scores',

        // Gamification / shop
        'gamification_reward_types',
        'employee_rewards',
        'achievements',
        'company_currency_settings',
        'company_onboarding_settings',
        'currency_balances',
        'currency_transactions',
        'shop_products',
        'shop_cart_items',
        'shop_orders',
        'shop_order_items',

        // Recognition / notifications / tickets
        'peer_recognitions',
        'peer_recognition_reactions',
        'notifications',
        'support_tickets',

        // Forms
        'demo_requests',
        'pricing_inquiries',
    ];

    public function handle(): int
    {
        $dir = rtrim($this->argument('dir'), '/');
        if (!is_dir($dir)) {
            $this->error("Каталог не найден: $dir");
            return 1;
        }

        $truncate = (bool) $this->option('truncate');

        // 1. Сначала users из _auth_users.json — без них FK летят
        $this->importAuthUsers("$dir/_auth_users.json", $truncate);

        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        try {
            foreach (self::TABLE_ORDER as $table) {
                if ($table === 'users') continue; // уже сделано
                $file = "$dir/{$table}.json";
                if (!file_exists($file)) {
                    $this->line("  skip $table (нет файла)");
                    continue;
                }
                $this->importTable($table, $file, $truncate);
            }
        } finally {
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }

        $this->info('Импорт завершён.');
        return 0;
    }

    protected function importAuthUsers(string $file, bool $truncate): void
    {
        if (!file_exists($file) || filesize($file) < 5) {
            $this->warn("  _auth_users.json пуст/отсутствует — пропускаю users (миграция профилей продолжится, но без email/password)");
            return;
        }
        $rows = json_decode((string) file_get_contents($file), true) ?: [];
        if ($truncate) {
            DB::table('users')->truncate();
        }

        $now = now();
        $bar = $this->output->createProgressBar(count($rows));
        $bar->setFormat("  users: %current%/%max% [%bar%]");
        $bar->start();

        $cols = Schema::getColumnListing('users');
        foreach ($rows as $r) {
            $meta = $r['raw_user_meta_data'] ?? [];
            if (is_string($meta)) $meta = json_decode($meta, true) ?: [];
            $row = [
                'id'                => $r['id'],
                'email'             => $r['email'] ?? null,
                'password'          => $r['encrypted_password'] ?? '',
                'email_verified_at' => $r['email_confirmed_at'] ?? null,
                'meta'              => json_encode($meta, JSON_UNESCAPED_UNICODE),
                'created_at'        => $r['created_at'] ?? $now,
                'updated_at'        => $r['updated_at'] ?? $now,
            ];
            // legacy required cols
            if (in_array('name', $cols, true))        $row['name']        = $meta['full_name'] ?? ($r['email'] ?? '');
            if (in_array('full_name', $cols, true))   $row['full_name']   = $meta['full_name'] ?? null;
            if (in_array('is_active', $cols, true))   $row['is_active']   = 1;
            if (in_array('is_verified', $cols, true)) $row['is_verified'] = 1;

            DB::table('users')->updateOrInsert(['id' => $r['id']], $row);
            $bar->advance();
        }
        $bar->finish();
        $this->newLine();
    }

    protected function importTable(string $table, string $file, bool $truncate): void
    {
        if (!Schema::hasTable($table)) {
            $this->warn("  таблица $table не найдена в MySQL — skip");
            return;
        }
        $rows = json_decode((string) file_get_contents($file), true);
        if (!is_array($rows) || empty($rows)) {
            $this->line("  $table: пусто");
            return;
        }

        if ($truncate) {
            DB::table($table)->truncate();
        }

        $cols = Schema::getColumnListing($table);
        $pk = in_array('id', $cols, true) ? 'id' : null;

        $bar = $this->output->createProgressBar(count($rows));
        $bar->setFormat("  $table: %current%/%max% [%bar%]");
        $bar->start();

        $inserted = 0; $skipped = 0; $errors = [];
        foreach ($rows as $r) {
            $row = $this->normalizeRow($r, $cols);
            try {
                if ($pk && !empty($row[$pk])) {
                    DB::table($table)->updateOrInsert([$pk => $row[$pk]], $row);
                } else {
                    DB::table($table)->insert($row);
                }
                $inserted++;
            } catch (\Throwable $e) {
                $skipped++;
                if (count($errors) < 3) $errors[] = $e->getMessage();
            }
            $bar->advance();
        }
        $bar->finish();
        $this->newLine();
        if ($skipped > 0) {
            $this->warn("    ошибок: $skipped (первые: " . implode(' | ', $errors) . ')');
        }
    }

    /**
     * Подогнать Postgres-row под MySQL-схему:
     *  - оставить только существующие колонки;
     *  - json/jsonb → строка json;
     *  - массивы → json;
     *  - boolean → 0/1.
     */
    protected function normalizeRow(array $r, array $cols): array
    {
        $out = [];
        foreach ($cols as $c) {
            if (!array_key_exists($c, $r)) continue;
            $v = $r[$c];
            if (is_array($v) || is_object($v)) {
                $out[$c] = json_encode($v, JSON_UNESCAPED_UNICODE);
            } elseif (is_bool($v)) {
                $out[$c] = $v ? 1 : 0;
            } else {
                $out[$c] = $v;
            }
        }
        return $out;
    }
}
