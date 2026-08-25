<?php

namespace App\Policies;

use App\Models\User;

/**
 * Комментарии к записям сообществ/ленты.
 *
 *  - view: любой сотрудник своей компании
 *  - create: любой аутентифицированный сотрудник (company_id проставляется сервером)
 *  - update: только автор комментария
 *  - delete: автор, либо hrd/hr/company_admin своей компании (модерация)
 */
class PortalCommentPolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, $model): bool
    {
        return $this->sameCompany($user, $model->company_id ?? null)
            || $this->ownsRecord($user, $model, 'author_id');
    }

    public function create(User $user): bool
    {
        return (bool) $user->companyId();
    }

    public function update(User $user, $model): bool
    {
        return $this->ownsRecord($user, $model, 'author_id');
    }

    public function delete(User $user, $model): bool
    {
        if ($this->ownsRecord($user, $model, 'author_id')) return true;

        return ($this->isHrd($user) || $this->isCompanyAdmin($user))
            && $this->sameCompany($user, $model->company_id ?? null);
    }
}
