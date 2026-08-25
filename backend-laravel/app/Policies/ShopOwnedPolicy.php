<?php

namespace App\Policies;

use App\Models\User;

/**
 * Shop cart / orders: сотрудник работает со своими записями, HRD/admin
 * своей компании могут просматривать и менять статус (fulfilled и т.п.).
 *
 * Колонка владельца — user_id. CompanyScope глобально режет по company_id.
 */
class ShopOwnedPolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        return (bool) $user->companyId();
    }

    public function view(User $user, $model): bool
    {
        $domainUserId = method_exists($user, 'domainUserId') ? $user->domainUserId() : $user->id;
        if ((string) ($model->user_id ?? '') === (string) $domainUserId) return true;
        if (($this->isHrd($user) || $this->isCompanyAdmin($user))
            && $this->sameCompany($user, $model->company_id ?? null)) return true;
        return false;
    }

    public function create(User $user): bool
    {
        return (bool) $user->companyId();
    }

    public function update(User $user, $model): bool
    {
        $domainUserId = method_exists($user, 'domainUserId') ? $user->domainUserId() : $user->id;
        if ((string) ($model->user_id ?? '') === (string) $domainUserId) return true;
        return ($this->isHrd($user) || $this->isCompanyAdmin($user))
            && $this->sameCompany($user, $model->company_id ?? null);
    }

    public function delete(User $user, $model): bool
    {
        return $this->update($user, $model);
    }
}
