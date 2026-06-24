<?php

namespace App\Policies;

use App\Models\User;
use App\Models\TeamMember;

/**
 * Универсальная политика для сущностей Трекера, где есть holder/assignee/manager_id.
 *
 * Правила:
 *  - superadmin: всё (через before)
 *  - company_admin/hrd своей компании: всё
 *  - manager: видит/правит свою команду (через team_members)
 *  - employee: видит/правит, где он holder/assignee/author/employee_id/manager_id
 */
class TrackerOwnedPolicy extends BasePolicy
{
    /** Имена возможных колонок-«владельцев» в модели. */
    protected array $ownerColumns = [
        'holder_id', 'assignee_id', 'author_id', 'employee_id', 'manager_id',
    ];

    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, $model): bool
    {
        return $this->canTouch($user, $model, readOnlyForCompanyRoles: true);
    }

    public function create(User $user): bool
    {
        // company-уровень проверим в update/sameCompany, здесь — любой авторизованный
        return (bool) $user->companyId();
    }

    public function update(User $user, $model): bool
    {
        return $this->canTouch($user, $model, readOnlyForCompanyRoles: false);
    }

    public function delete(User $user, $model): bool
    {
        if ($this->isCompanyAdmin($user) && $this->sameCompany($user, $model->company_id ?? null)) return true;
        if (($model->author_id ?? null) === $user->id) return true;
        return false;
    }

    protected function canTouch(User $user, $model, bool $readOnlyForCompanyRoles): bool
    {
        $companyId = $model->company_id ?? null;

        // owners (employees themselves)
        foreach ($this->ownerColumns as $col) {
            if (isset($model->{$col}) && $model->{$col} === $user->id) return true;
        }

        // company-level roles
        if (($this->isHrd($user) || $this->isCompanyAdmin($user)) && $this->sameCompany($user, $companyId)) {
            // hrd read-only on write paths (kept simple: allow update for both)
            return true;
        }

        // manager — viewable/editable if target user is in his team
        if ($this->isManager($user)) {
            $candidates = array_filter([
                $model->holder_id ?? null,
                $model->assignee_id ?? null,
                $model->employee_id ?? null,
            ]);
            foreach ($candidates as $cand) {
                $isMine = TeamMember::query()
                    ->withoutGlobalScopes()
                    ->where('manager_id', $user->id)
                    ->where('employee_id', $cand)
                    ->exists();
                if ($isMine) return true;
            }
        }

        return false;
    }
}
