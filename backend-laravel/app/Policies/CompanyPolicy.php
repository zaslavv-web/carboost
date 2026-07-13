<?php

namespace App\Policies;

use App\Models\Company;
use App\Models\User;

class CompanyPolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        // Только superadmin (bypass через BasePolicy::before).
        // Обычные пользователи получают свою компанию через /api/profiles/me
        // либо точечный view(). Список компаний закрыт, чтобы избежать утечки тенантов.
        return false;
    }

    public function view(User $user, Company $company): bool
    {
        return $user->companyId() === $company->id;
    }

    public function create(User $user): bool
    {
        // только superadmin (через before)
        return false;
    }

    public function update(User $user, Company $company): bool
    {
        return $this->isCompanyAdmin($user) && $user->companyId() === $company->id;
    }

    public function delete(User $user, Company $company): bool
    {
        return false;
    }
}
