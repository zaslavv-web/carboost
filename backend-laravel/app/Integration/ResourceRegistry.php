<?php

namespace App\Integration;

use App\Models\Competency;
use App\Models\Course;
use App\Models\Department;
use App\Models\Enrollment;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\PerformanceCycle;
use App\Models\PerformanceReview;
use App\Models\Position;
use App\Models\Profile;
use App\Models\TrackerGoal;
use App\Models\TrackerTask;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Реестр ресурсов, открытых наружу через /api/v1.
 *
 * Одна запись здесь даёт сразу всё: REST-маршруты в обе стороны, скоупы ключа,
 * события в журнале и вебхуках, описание в OpenAPI и pull-фиде.
 */
final class ResourceRegistry
{
    /** @var array<string, ResourceDefinition>|null */
    private static ?array $cache = null;

    /** @return array<string, ResourceDefinition> */
    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        $definitions = [
            new ResourceDefinition(
                name: 'employees',
                model: Profile::class,
                scope: 'employees',
                title: 'Сотрудники',
                read: ['id', 'user_id', 'full_name', 'avatar_url', 'company_id', 'department', 'position_id', 'is_verified', 'requested_role', 'external_id', 'created_at', 'updated_at'],
                write: ['full_name', 'avatar_url', 'department', 'position_id', 'is_verified', 'external_id'],
                filters: ['user_id', 'department', 'position_id', 'is_verified', 'external_id'],
                externalId: true,
            ),
            new ResourceDefinition(
                name: 'departments',
                model: Department::class,
                scope: 'departments',
                title: 'Подразделения',
                read: ['id', 'name', 'description', 'parent_id', 'head_user_id', 'company_id', 'external_id', 'created_at', 'updated_at'],
                write: ['name', 'description', 'parent_id', 'head_user_id', 'external_id'],
                filters: ['name', 'parent_id', 'head_user_id', 'external_id'],
                externalId: true,
            ),
            new ResourceDefinition(
                name: 'positions',
                model: Position::class,
                scope: 'positions',
                title: 'Должности',
                read: ['id', 'title', 'description', 'department', 'company_id', 'profile_status', 'profile_version', 'competency_profile', 'external_id', 'created_at', 'updated_at'],
                write: ['title', 'description', 'department', 'competency_profile', 'profile_status', 'external_id'],
                filters: ['title', 'department', 'profile_status', 'external_id'],
                externalId: true,
            ),
            new ResourceDefinition(
                name: 'leave_requests',
                model: LeaveRequest::class,
                scope: 'leaves',
                title: 'Заявки на отсутствие',
                read: ['id', 'user_id', 'company_id', 'leave_type_id', 'start_date', 'end_date', 'days_count', 'reason', 'status', 'manager_id', 'manager_decision_at', 'hr_id', 'hr_decision_at', 'substitute_user_id', 'paid_days', 'unpaid_days', 'created_at', 'updated_at'],
                write: ['user_id', 'leave_type_id', 'start_date', 'end_date', 'days_count', 'reason', 'status', 'substitute_user_id', 'paid_days', 'unpaid_days'],
                filters: ['user_id', 'leave_type_id', 'status', 'start_date', 'end_date'],
            ),
            new ResourceDefinition(
                name: 'leave_types',
                model: LeaveType::class,
                scope: 'leaves',
                title: 'Виды отсутствий',
                read: ['id', 'company_id', 'code', 'title', 'paid', 'accrual_days_per_year', 'requires_medical_cert', 'is_active', 'created_at', 'updated_at'],
                write: ['code', 'title', 'paid', 'accrual_days_per_year', 'requires_medical_cert', 'is_active'],
                filters: ['code', 'is_active', 'paid'],
            ),
            new ResourceDefinition(
                name: 'leave_balances',
                model: LeaveBalance::class,
                scope: 'leaves',
                title: 'Остатки отсутствий',
                read: ['id', 'user_id', 'company_id', 'leave_type_id', 'accrued_days', 'used_days', 'carryover_days', 'as_of', 'created_at', 'updated_at'],
                write: ['user_id', 'leave_type_id', 'accrued_days', 'used_days', 'carryover_days', 'as_of'],
                filters: ['user_id', 'leave_type_id', 'as_of'],
            ),
            new ResourceDefinition(
                name: 'goals',
                model: TrackerGoal::class,
                scope: 'goals',
                title: 'Цели и OKR',
                read: ['id', 'company_id', 'period_id', 'holder_id', 'author_id', 'parent_goal_id', 'team_id', 'title', 'description', 'status', 'progress', 'scope_type', 'scope_ref', 'scope_label', 'published_at', 'archived_at', 'created_at', 'updated_at'],
                write: ['period_id', 'holder_id', 'parent_goal_id', 'team_id', 'title', 'description', 'status', 'progress', 'scope_type', 'scope_ref', 'scope_label'],
                filters: ['holder_id', 'period_id', 'status', 'team_id'],
            ),
            new ResourceDefinition(
                name: 'tasks',
                model: TrackerTask::class,
                scope: 'tasks',
                title: 'Задачи',
                read: ['id', 'company_id', 'project_id', 'sprint_id', 'author_id', 'assignee_id', 'parent_task_id', 'type', 'title', 'description', 'status', 'workflow_status_id', 'urgency', 'priority', 'story_points', 'estimate_minutes', 'labels', 'due_at', 'start_at', 'jira_key', 'completed_at', 'created_at', 'updated_at'],
                write: ['project_id', 'sprint_id', 'assignee_id', 'parent_task_id', 'type', 'title', 'description', 'status', 'urgency', 'priority', 'story_points', 'estimate_minutes', 'labels', 'due_at', 'start_at', 'jira_key'],
                filters: ['project_id', 'sprint_id', 'assignee_id', 'status', 'type', 'jira_key'],
            ),
            new ResourceDefinition(
                name: 'performance_reviews',
                model: PerformanceReview::class,
                scope: 'performance',
                title: 'Оценки performance',
                read: ['id', 'cycle_id', 'user_id', 'company_id', 'manager_id', 'status', 'self_score', 'manager_score', 'peer_score', 'final_score', 'summary', 'finalized_at', 'created_at', 'updated_at'],
                write: ['cycle_id', 'user_id', 'manager_id', 'status', 'self_score', 'manager_score', 'peer_score', 'final_score', 'summary'],
                filters: ['cycle_id', 'user_id', 'manager_id', 'status'],
            ),
            new ResourceDefinition(
                name: 'performance_cycles',
                model: PerformanceCycle::class,
                scope: 'performance',
                title: 'Циклы performance',
                read: ['id', 'company_id', 'title', 'period_start', 'period_end', 'deadline', 'status', 'weights', 'created_at', 'updated_at'],
                write: ['title', 'period_start', 'period_end', 'deadline', 'status', 'weights'],
                filters: ['status', 'period_start', 'period_end'],
            ),
            new ResourceDefinition(
                name: 'competencies',
                model: Competency::class,
                scope: 'competencies',
                title: 'Компетенции сотрудников',
                read: ['id', 'user_id', 'company_id', 'skill_name', 'skill_value', 'target_value', 'category', 'created_at', 'updated_at'],
                write: ['user_id', 'skill_name', 'skill_value', 'target_value', 'category'],
                filters: ['user_id', 'skill_name', 'category'],
            ),
            new ResourceDefinition(
                name: 'courses',
                model: Course::class,
                scope: 'learning',
                title: 'Курсы',
                read: ['id', 'company_id', 'title', 'slug', 'description', 'cover_url', 'level', 'duration_min', 'tags', 'competencies', 'status', 'mandatory', 'author_id', 'created_at', 'updated_at'],
                write: ['title', 'slug', 'description', 'cover_url', 'level', 'duration_min', 'tags', 'competencies', 'status', 'mandatory'],
                filters: ['status', 'level', 'mandatory', 'slug'],
            ),
            new ResourceDefinition(
                name: 'enrollments',
                model: Enrollment::class,
                scope: 'learning',
                title: 'Назначения курсов',
                read: ['id', 'course_id', 'user_id', 'assigned_by', 'mandatory', 'due_at', 'blocks_other', 'status', 'started_at', 'completed_at', 'created_at', 'updated_at'],
                write: ['course_id', 'user_id', 'mandatory', 'due_at', 'blocks_other', 'status', 'started_at', 'completed_at'],
                filters: ['course_id', 'user_id', 'status'],
                // У enrollments нет своей company_id — принадлежность идёт через курс.
                companyScope: static function (Builder $query, string $companyId): void {
                    $query->whereIn(
                        'enrollments.course_id',
                        DB::table('courses')->where('company_id', $companyId)->select('id')
                    );
                },
                companyResolver: static fn (object $model): ?string => DB::table('courses')
                    ->where('id', $model->course_id)
                    ->value('company_id'),
            ),
        ];

        $map = [];
        foreach ($definitions as $definition) {
            $map[$definition->name] = $definition;
        }

        return self::$cache = $map;
    }

    public static function find(string $name): ?ResourceDefinition
    {
        return self::all()[$name] ?? null;
    }

    /** @return string[] Все скоупы, которые можно выдать ключу. */
    public static function scopes(): array
    {
        $scopes = [];
        foreach (self::all() as $definition) {
            $scopes[$definition->readScope()] = true;
            $scopes[$definition->writeScope()] = true;
        }
        $scopes['events:read'] = true;
        ksort($scopes);

        return array_keys($scopes);
    }

    /** @return string[] Все события, на которые можно подписаться. */
    public static function events(): array
    {
        $events = [];
        foreach (self::all() as $definition) {
            foreach (['created', 'updated', 'deleted'] as $verb) {
                $events[] = $definition->name . '.' . $verb;
            }
        }
        sort($events);

        return $events;
    }

    /** Сброс кэша — нужен тестам, которые подменяют реестр. */
    public static function flush(): void
    {
        self::$cache = null;
    }
}
