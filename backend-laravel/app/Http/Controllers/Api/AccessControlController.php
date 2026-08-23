<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
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
        $overrides = [];
        if ($companyId) {
            foreach (DB::table('role_permissions')->where('company_id', $companyId)->get() as $row) {
                $overrides[$row->role . '|' . $row->resource] = $row;
            }
        }

        $resources = [];
        foreach (self::RESOURCES as $key => [$label, $group]) {
            $resources[] = ['key' => $key, 'label' => $label, 'group' => $group];
        }

        $matrix = [];
        foreach (self::ROLES as $role) {
            foreach (self::RESOURCES as $key => $_) {
                $def = self::defaultFor($role, $key);
                $row = $overrides[$role . '|' . $key] ?? null;
                $matrix[] = [
                    'role'         => $role,
                    'resource'     => $key,
                    'can_view'     => $row ? (bool) $row->can_view : $def['can_view'],
                    'can_edit'     => $row ? (bool) $row->can_edit : $def['can_edit'],
                    'can_download' => $row ? (bool) $row->can_download : $def['can_download'],
                    'is_custom'    => (bool) $row,
                ];
            }
        }

        return response()->json([
            'roles'     => self::ROLES,
            'resources' => $resources,
            'matrix'    => $matrix,
            'editable'  => $this->canManage(),
        ]);
    }

    /** Права текущего пользователя — используется фронтом для навигации. */
    public function me(Request $r)
    {
        $roles = $this->roles();
        if (in_array('superadmin', $roles, true)) {
            $out = [];
            foreach (array_keys(self::RESOURCES) as $key) {
                $out[$key] = ['can_view' => true, 'can_edit' => true, 'can_download' => true];
            }
            return response()->json(['permissions' => $out]);
        }

        $companyId = $this->companyId();
        $overrides = [];
        if ($companyId && $roles) {
            foreach (DB::table('role_permissions')->where('company_id', $companyId)->whereIn('role', $roles)->get() as $row) {
                $overrides[$row->role . '|' . $row->resource] = $row;
            }
        }

        $out = [];
        foreach (array_keys(self::RESOURCES) as $key) {
            $view = $edit = $down = false;
            foreach ($roles as $role) {
                $def = self::defaultFor($role, $key);
                $row = $overrides[$role . '|' . $key] ?? null;
                $view = $view || ($row ? (bool) $row->can_view : $def['can_view']);
                $edit = $edit || ($row ? (bool) $row->can_edit : $def['can_edit']);
                $down = $down || ($row ? (bool) $row->can_download : $def['can_download']);
            }
            $out[$key] = ['can_view' => $view, 'can_edit' => $edit, 'can_download' => $down];
        }

        return response()->json(['permissions' => $out]);
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
                $role = (string) ($item['role'] ?? '');
                $resource = (string) ($item['resource'] ?? '');
                if (! in_array($role, self::ROLES, true) || ! isset(self::RESOURCES[$resource])) {
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
                $existing = DB::table('role_permissions')
                    ->where('company_id', $companyId)->where('role', $role)->where('resource', $resource)
                    ->first();
                if ($existing) {
                    DB::table('role_permissions')->where('id', $existing->id)->update($values);
                } else {
                    DB::table('role_permissions')->insert($values + [
                        'id'         => (string) Str::uuid(),
                        'company_id' => $companyId,
                        'role'       => $role,
                        'resource'   => $resource,
                        'created_at' => now(),
                    ]);
                }
            }
        });

        return $this->matrix($r);
    }

    /** Сброс матрицы компании к значениям по умолчанию. */
    public function reset(Request $r)
    {
        if (! $this->canManage()) return response()->json(['error' => 'Недостаточно прав'], 403);
        $companyId = $this->companyId();
        if ($companyId) {
            DB::table('role_permissions')->where('company_id', $companyId)->delete();
        }
        return $this->matrix($r);
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
