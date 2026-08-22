<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Индексы под карту сотрудников и аналитику карьерных треков.
 */
return new class extends Migration
{
    /** @var array<int, array{0:string,1:string,2:array<int,string>}> */
    private array $indexes = [
        ['hr_tasks', 'hr_tasks_company_created_idx', ['company_id', 'created_at']],
        ['hr_task_assignees', 'hr_task_assignees_task_idx', ['task_id']],
        ['employee_career_assignments', 'eca_user_idx', ['user_id']],
        ['employee_career_assignments', 'eca_template_idx', ['template_id']],
        ['career_step_submissions', 'css_assignment_step_idx', ['assignment_id', 'step_order']],
        ['test_attempts', 'test_attempts_user_created_idx', ['user_id', 'created_at']],
        ['currency_balances', 'currency_balances_company_idx', ['company_id']],
        ['team_members', 'team_members_company_idx', ['company_id']],
    ];

    public function up(): void
    {
        foreach ($this->indexes as [$table, $name, $columns]) {
            if (! Schema::hasTable($table)) {
                continue;
            }
            foreach ($columns as $column) {
                if (! Schema::hasColumn($table, $column)) {
                    continue 2;
                }
            }
            try {
                Schema::table($table, function ($t) use ($columns, $name) {
                    $t->index($columns, $name);
                });
            } catch (\Throwable $e) {
                // Индекс уже существует — миграция должна оставаться идемпотентной.
                DB::statement('SELECT 1');
            }
        }
    }

    public function down(): void
    {
        foreach ($this->indexes as [$table, $name, $columns]) {
            if (! Schema::hasTable($table)) {
                continue;
            }
            try {
                Schema::table($table, function ($t) use ($name) {
                    $t->dropIndex($name);
                });
            } catch (\Throwable $e) {
                DB::statement('SELECT 1');
            }
        }
    }
};
