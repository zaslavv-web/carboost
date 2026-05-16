<?php

namespace App\Policies;

use App\Models\User;

/**
 * Политика для пользовательских записей:
 *  assessments, competencies, achievements, career_goals, notifications, support_tickets.
 *
 *  - own: владелец делает что угодно
 *  - hrd своей компании: read-only
 *  - company_admin своей компании: read-only (для тикетов — также update)
 */
class OwnedRecordPolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, $model): bool
    {
        if ($this->ownsRecord($user, $model)) return true;
        if (($this->isHrd($user) || $this->isCompanyAdmin($user))
            && $this->sameCompany($user, $model->company_id ?? null)) return true;
        return false;
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, $model): bool
    {
        return $this->ownsRecord($user, $model);
    }

    public function delete(User $user, $model): bool
    {
        return $this->ownsRecord($user, $model);
    }
}
