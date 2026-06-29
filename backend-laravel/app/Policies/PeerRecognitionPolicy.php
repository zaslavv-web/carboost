<?php

namespace App\Policies;

use App\Models\User;

/**
 * Peer recognition: любой сотрудник компании может отправить признание
 * коллеге, видеть ленту своей компании и удалять/редактировать только своё.
 */
class PeerRecognitionPolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        return (bool) $user->companyId();
    }

    public function view(User $user, $model): bool
    {
        return $this->sameCompany($user, $model->company_id ?? null);
    }

    public function create(User $user): bool
    {
        return (bool) $user->companyId();
    }

    public function update(User $user, $model): bool
    {
        return $this->sameCompany($user, $model->company_id ?? null)
            && ($model->from_user_id ?? null) === $user->id;
    }

    public function delete(User $user, $model): bool
    {
        if ($this->isHrd($user) || $this->isCompanyAdmin($user)) {
            return $this->sameCompany($user, $model->company_id ?? null);
        }
        return $this->update($user, $model);
    }
}
