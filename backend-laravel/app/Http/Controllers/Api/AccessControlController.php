<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Ролевая модель прав компании.
 *
 * Матрица «роль × раздел» с флагами просмотр / редактирование / скачивание.
 * Значения по умолчанию заданы в коде (DEFAULTS), в БД хранятся только
 * переопределения конкретной компании — так новая компания сразу работает,
 * а админ может точечно закрыть или открыть разделы.
 */
class AccessControlController extends Controller
{
    /** Роли, которыми можно управлять из интерфейса компании. */
    public const ROLES = ['employee', 'manager', 'hr', 'hrd', 'company_admin'];

    /** Разделы продукта: ключ => [название, группа]. */
    public const RESOURCES = [
        'employees'        => ['Сотрудники и профили', 'Персонал'],
        'invitations'      => ['Приглашения', 'Персонал'],
        'adaptation'       => ['Планы адаптации', 'Персонал'],
        'positions'        => ['Должности и карьерные треки', 'Персонал'],
        'performance'      => ['Performance Review', 'Оценка'],
        'talent_review'    => ['Talent Review (9-box)', 'Оценка'],
        'skills_matrix'    => ['Матрица компетенций', 'Оценка'],
        'probation'        => ['Испытательный срок', 'Оценка'],
        'disciplinary'     => ['Дисциплинарные взыскания', 'Оценка'],
        'analytics'        => ['People Analytics', 'Аналитика'],
        'risk_analytics'   => ['Аналитика рисков', 'Аналитика'],
        'pulse'            => ['Pulse-опросы', 'Аналитика'],
        'hr_documents'     => ['HR-документы', 'Документы'],
        'kedo'             => ['КЭДО', 'Документы'],
        'hr_policies'      => ['Политики компании', 'Документы'],
        'leaves'           => ['Отсутствия и отпуска', 'Документы'],
        'university'       => ['Корпоративный университет', 'Обучение'],
        'knowledge_base'   => ['База знаний', 'Обучение'],
        'shop'             => ['Магазин и геймификация', 'Мотивация'],
        'settings'         => ['Настройки компании', 'Администрирование'],
        'access_control'   => ['Права доступа', 'Администрирование'],
    ];

    /**
     * Дефолтная матрица: role => resource => [view, edit, download].
     * Роли, отсутствующие в списке для ресурса, получают базовое значение
     * из fallback() — сотрудник видит только «свои» разделы.
     */
    private const EDIT_BY_ROLE = [
        'company_admin' => '*',
        'hrd'           => '*',
        'hr'            => ['employees', 'invitations', 'adaptation', 'hr_documents', 'kedo', 'leaves', 'university', 'knowledge_base', 'probation', 'pulse'],
        'manager'       => ['performance', 'adaptation', 'leaves'],
        'employee'      => [],
    ];

    private const VIEW_BY_ROLE = [
        'company_admin' => '*',
        'hrd'           => '*',
        'hr'            => '*',
        'manager'       => ['employees', 'adaptation', 'positions', 'performance', 'skills_matrix', 'probation', 'analytics', 'pulse', 'hr_policies', 'leaves', 'university', 'knowledge_base', 'shop'],
        'employee'      => ['hr_policies', 'leaves', 'university', 'knowledge_base', 'shop', 'hr_documents', 'kedo'],
    ];

    /** Разделы администрирования доступны только company_admin. */
    private const ADMIN_ONLY = ['settings', 'access_control'];

    protected function companyId(): ?string
    {
        $u = Auth::user();
        if (! $u) return null;
        return method_exists($u, 'companyId')
            ? $u->companyId()
            : DB::table('profiles')->where('user_id', $u->id)->value('company_id');
    }

    protected function roles(): array
    {
        $u = Auth::user();
        if (! $u) return [];
        return DB::table('user_roles')->where('user_id', $u->id)->pluck('role')->all();
    }

    protected function canManage(): bool
    {
        return (bool) array_intersect($this->roles(), ['company_admin', 'superadmin']);
    }

    private function hasRulesTable(): bool
    {
        return Schema::hasTable('access_permission_rules');
    }

    private function subjects(string $companyId): array
    {
        return [
            'roles' => array_map(fn ($id) => ['id' => $id, 'label' => $id], self::ROLES),
            'users' => DB::table('profiles')->where('company_id', $companyId)->orderBy('full_name')->get(['user_id as id', 'full_name as label'])->all(),
            'positions' => DB::table('positions')->where('company_id', $companyId)->orderBy('title')->get(['id', 'title as label'])->all(),
            'departments' => DB::table('departments')->where('company_id', $companyId)->orderBy('name')->get(['id', 'name as label'])->all(),
        ];
    }

    /** Кэш на время запроса: матрица считается один раз на пользователя. */
    private static array $permCache = [];

    public static function effectivePermissions($user, ?string $companyId = null): array
    {
        $cacheKey = ($user?->id ?? 'guest') . '|' . ($companyId ?? '');
        if (isset(self::$permCache[$cacheKey])) return self::$permCache[$cacheKey];

        $companyId = $companyId ?: $user?->companyId();
        $roles = $user ? DB::table('user_roles')->where('user_id', $user->id)->pluck('role')->all() : [];
        if (in_array('superadmin', $roles, true)) {
            return self::$permCache[$cacheKey] = array_fill_keys(array_keys(self::RESOURCES), ['can_view' => true, 'can_edit' => true, 'can_download' => true, 'source' => 'superadmin']);
        }
        $profile = null;
        $positionId = null;
        $departmentId = null;
        try {
            $profile = $user && $companyId ? DB::table('profiles')->where('company_id', $companyId)->where('user_id', $user->id)->first() : null;
            $positionId = $profile?->position_id;
            if ($profile?->department && Schema::hasTable('departments')) {
                $departmentId = DB::table('departments')->where('company_id', $companyId)->where('name', $profile->department)->value('id');
            }
        } catch (\Throwable $e) {
            report($e);
        }
        $rules = collect();
        if ($companyId && Schema::hasTable('access_permission_rules')) {
            $rules = DB::table('access_permission_rules')->where('company_id', $companyId)->where(function ($q) use ($user, $roles, $positionId, $departmentId) {

                $q->where(fn ($x) => $x->where('subject_type', 'role')->whereIn('subject_id', $roles));
                if ($departmentId) $q->orWhere(fn ($x) => $x->where('subject_type', 'department')->where('subject_id', $departmentId));
                if ($positionId) $q->orWhere(fn ($x) => $x->where('subject_type', 'position')->where('subject_id', $positionId));
                if ($user) $q->orWhere(fn ($x) => $x->where('subject_type', 'user')->where('subject_id', $user->id));
            })->get();
        }
        $out = [];
        foreach (array_keys(self::RESOURCES) as $resource) {
            $base = ['can_view' => false, 'can_edit' => false, 'can_download' => false, 'source' => 'default'];
            foreach ($roles as $role) {
                $def = self::defaultFor($role, $resource);
                foreach (['can_view','can_edit','can_download'] as $flag) $base[$flag] = $base[$flag] || $def[$flag];
            }
            foreach (['role', 'department', 'position', 'user'] as $type) {
                $candidates = $rules->where('resource', $resource)->where('subject_type', $type);
                if ($candidates->isEmpty()) continue;
                $base = [
                    'can_view' => (bool) $candidates->contains(fn ($r) => $r->can_view),
                    'can_edit' => (bool) $candidates->contains(fn ($r) => $r->can_edit),
                    'can_download' => (bool) $candidates->contains(fn ($r) => $r->can_download),
                    'source' => $type,
                ];
            }
            if (! $base['can_view']) $base['can_edit'] = $base['can_download'] = false;
            $out[$resource] = $base;
        }
        return $out;
    }

    public static function allows($user, string $resource, string $action = 'view'): bool
    {
        $permission = self::effectivePermissions($user)[$resource] ?? null;
        return (bool) ($permission['can_' . $action] ?? false);
    }

    /** Дефолт для пары роль/раздел. */
    public static function defaultFor(string $role, string $resource): array
    {
        if ($role === 'superadmin') {
            return ['can_view' => true, 'can_edit' => true, 'can_download' => true];
        }
        $adminOnly = in_array($resource, self::ADMIN_ONLY, true);
        $view = self::VIEW_BY_ROLE[$role] ?? [];
        $edit = self::EDIT_BY_ROLE[$role] ?? [];

        $canView = $view === '*' ? true : in_array($resource, (array) $view, true);
        $canEdit = $edit === '*' ? true : in_array($resource, (array) $edit, true);

        if ($adminOnly && $role !== 'company_admin') {
            $canView = false;
            $canEdit = false;
        }

        return [
            'can_view'     => $canView,
            'can_edit'     => $canEdit,
            'can_download' => $canView,
        ];
    }

    /** Полная матрица компании: дефолты + сохранённые переопределения. */
    public function matrix(Request $r)
    {
        $companyId = $this->companyId();
        if (! $companyId) return response()->json(['error' => 'Не указана компания'], 422);
        $subjectType = (string) $r->query('subject_type', 'role');
        $subjectId = (string) $r->query('subject_id', 'employee');
        $overrides = [];
        if ($this->hasRulesTable()) {
            foreach (DB::table('access_permission_rules')->where('company_id', $companyId)->where('subject_type', $subjectType)->where('subject_id', $subjectId)->get() as $row) {
                $overrides[$row->resource] = $row;
            }
        }

        $resources = [];
        foreach (self::RESOURCES as $key => [$label, $group]) {
            $resources[] = ['key' => $key, 'label' => $label, 'group' => $group];
        }

        $matrix = [];
        foreach (self::RESOURCES as $key => $_) {
                $def = $subjectType === 'role' ? self::defaultFor($subjectId, $key) : ['can_view' => false, 'can_edit' => false, 'can_download' => false];
                $row = $overrides[$key] ?? null;
                $matrix[] = [
                    'subject_type' => $subjectType,
                    'subject_id'   => $subjectId,
                    'resource'     => $key,
                    'can_view'     => $row ? (bool) $row->can_view : $def['can_view'],
                    'can_edit'     => $row ? (bool) $row->can_edit : $def['can_edit'],
                    'can_download' => $row ? (bool) $row->can_download : $def['can_download'],
                    'is_custom'    => (bool) $row,
                ];
        }

        return response()->json([
            'roles'     => self::ROLES,
            'subjects'  => $this->subjects($companyId),
            'selected'  => ['type' => $subjectType, 'id' => $subjectId],
            'resources' => $resources,
            'matrix'    => $matrix,
            'editable'  => $this->canManage(),
        ]);
    }

    /** Права текущего пользователя — используется фронтом для навигации. */
    public function me(Request $r)
    {
        return response()->json(['permissions' => self::effectivePermissions($r->user(), $this->companyId())]);
    }

    /** Массовое сохранение изменений матрицы. */
    public function save(Request $r)
    {
        if (! $this->canManage()) return response()->json(['error' => 'Недостаточно прав'], 403);
        $companyId = $this->companyId();
        if (! $companyId) return response()->json(['error' => 'Не указана компания'], 422);

        $items = (array) $r->input('items', []);
        if (! $items) return response()->json(['error' => 'Нечего сохранять'], 422);

        DB::transaction(function () use ($items, $companyId) {
            foreach ($items as $item) {
                $subjectType = (string) ($item['subject_type'] ?? 'role');
                $subjectId = (string) ($item['subject_id'] ?? '');
                $resource = (string) ($item['resource'] ?? '');
                if (! in_array($subjectType, ['role','user','position','department'], true) || $subjectId === '' || ! isset(self::RESOURCES[$resource])) {
                    continue;
                }
                $canView = (bool) ($item['can_view'] ?? false);
                $values = [
                    'can_view'     => $canView,
                    // Редактирование и скачивание невозможны без просмотра.
                    'can_edit'     => $canView && (bool) ($item['can_edit'] ?? false),
                    'can_download' => $canView && (bool) ($item['can_download'] ?? false),
                    'updated_at'   => now(),
                ];
                $existing = DB::table('access_permission_rules')
                    ->where('company_id', $companyId)->where('subject_type', $subjectType)->where('subject_id', $subjectId)->where('resource', $resource)
                    ->first();
                if ($existing) {
                    DB::table('access_permission_rules')->where('id', $existing->id)->update($values + ['updated_by' => Auth::id()]);
                } else {
                    DB::table('access_permission_rules')->insert($values + [
                        'id'         => (string) Str::uuid(),
                        'company_id' => $companyId,
                        'subject_type' => $subjectType,
                        'subject_id' => $subjectId,
                        'resource'   => $resource,
                        'updated_by' => Auth::id(),
                        'created_at' => now(),
                    ]);
                }
                DB::table('access_permission_log')->insert([
                    'id' => (string) Str::uuid(), 'company_id' => $companyId,
                    'subject_type' => $subjectType, 'subject_id' => $subjectId, 'resource' => $resource,
                    'before_value' => $existing ? json_encode($existing) : null, 'after_value' => json_encode($values),
                    'changed_by' => Auth::id(), 'created_at' => now(),
                ]);
            }
        });

        return response()->json(['saved' => count($items)]);
    }

    /** Сброс матрицы компании к значениям по умолчанию. */
    public function reset(Request $r)
    {
        if (! $this->canManage()) return response()->json(['error' => 'Недостаточно прав'], 403);
        $companyId = $this->companyId();
        if ($companyId) {
            $type = (string) $r->input('subject_type', 'role');
            $id = (string) $r->input('subject_id', 'employee');
            DB::table('access_permission_rules')->where('company_id', $companyId)->where('subject_type', $type)->where('subject_id', $id)->delete();
        }
        return response()->json(['reset' => true]);
    }

    /** История назначения ролей сотрудникам. */
    public function roleChanges(Request $r)
    {
        if (! $this->canManage()) return response()->json(['error' => 'Недостаточно прав'], 403);
        $companyId = $this->companyId();

        $rows = DB::table('role_change_log as l')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'l.user_id')
            ->leftJoin('profiles as a', 'a.user_id', '=', 'l.changed_by')
            ->when($companyId && ! in_array('superadmin', $this->roles(), true),
                fn ($q) => $q->where('l.company_id', $companyId))
            ->orderByDesc('l.created_at')
            ->limit(200)
            ->get([
                'l.id', 'l.user_id', 'l.old_role', 'l.new_role', 'l.created_at',
                'p.full_name as user_name', 'a.full_name as actor_name',
            ]);

        return response()->json(['items' => $rows]);
    }
}
