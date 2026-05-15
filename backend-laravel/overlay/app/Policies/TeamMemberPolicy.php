<?php

namespace App\Policies;

use App\Models\User;

class TeamMemberPolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        return $this->isManager($user) || $this->isHrd($user) || $this->isCompanyAdmin($user);
    }

    public function view(User $user, $model): bool
    {
        if (($model->manager_id ?? null) === $user->id) return true;
        if (($this->isHrd($user) || $this->isCompanyAdmin($user))
            && $this->sameCompany($user, $model->company_id ?? null)) return true;
        return false;
    }

    public function create(User $user): bool
    {
        return $this->isManager($user) || $this->isHrd($user) || $this->isCompanyAdmin($user);
    }

    public function update(User $user, $model): bool
    {
        return $this->view($user, $model);
    }

    public function delete(User $user, $model): bool
    {
        return $this->update($user, $model);
    }
}
