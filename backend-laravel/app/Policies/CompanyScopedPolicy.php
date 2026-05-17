<?php

namespace App\Policies;

use App\Models\User;

/**
 * Универсальная политика для company-scoped справочников:
 *  departments, positions, hr_documents, position_career_paths,
 *  assessment_scenarios, и т.п.
 *
 * Правила:
 *  - view: любой пользователь своей компании
 *  - manage (create/update/delete): hrd или company_admin своей компании
 */
class CompanyScopedPolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        // Любой аутентифицированный пользователь может листать справочники.
        // Фильтрация по company_id выполняется на уровне запроса/UI.
        return true;
    }

    public function view(User $user, $model): bool
    {
        return $this->sameCompany($user, $model->company_id ?? null);
    }

    public function create(User $user): bool
    {
        return ($this->isHrd($user) || $this->isCompanyAdmin($user)) && $user->companyId();
    }

    public function update(User $user, $model): bool
    {
        return ($this->isHrd($user) || $this->isCompanyAdmin($user))
            && $this->sameCompany($user, $model->company_id ?? null);
    }

    public function delete(User $user, $model): bool
    {
        return $this->update($user, $model);
    }
}
