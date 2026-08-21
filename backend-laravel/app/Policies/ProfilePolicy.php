<?php

namespace App\Policies;

use App\Models\Profile;
use App\Models\User;

class ProfilePolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        // Руководителю нужен справочник сотрудников своей компании
        // (карточки команды, назначения задач, 1:1). Скоуп по company_id
        // накладывается на уровне запроса.
        return $this->isHrd($user) || $this->isCompanyAdmin($user) || $this->isManager($user);
    }

    public function view(User $user, Profile $profile): bool
    {
        if ($profile->user_id === $user->id) return true;
        if (($this->isHrd($user) || $this->isCompanyAdmin($user) || $this->isManager($user))
            && $this->sameCompany($user, $profile->company_id)) return true;
        return false;
    }

    public function update(User $user, Profile $profile): bool
    {
        if ($profile->user_id === $user->id) return true;
        if ($this->isCompanyAdmin($user) && $this->sameCompany($user, $profile->company_id)) return true;
        return false;
    }

    public function verify(User $user, Profile $profile): bool
    {
        return $this->isCompanyAdmin($user) && $this->sameCompany($user, $profile->company_id);
    }
}
