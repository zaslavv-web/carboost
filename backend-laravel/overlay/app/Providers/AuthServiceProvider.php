<?php

namespace App\Providers;

use App\Models\Company;
use App\Models\Profile;
use App\Policies\CompanyPolicy;
use App\Policies\CompanyScopedPolicy;
use App\Policies\OwnedRecordPolicy;
use App\Policies\ProfilePolicy;
use App\Policies\TeamMemberPolicy;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Gate;

class AuthServiceProvider extends ServiceProvider
{
    /**
     * Регистрация политик.
     *
     * Конкретные модели (Department, Position, Assessment, и т.п.) будут
     * созданы в Phase 5; здесь зарегистрированы только Profile и Company.
     * Универсальные политики (CompanyScopedPolicy / OwnedRecordPolicy /
     * TeamMemberPolicy) подвязываются к моделям там же через $this->policies[].
     */
    protected $policies = [
        Profile::class => ProfilePolicy::class,
        Company::class => CompanyPolicy::class,
    ];

    public function boot(): void
    {
        $this->registerPolicies();

        // Доменные роли (используем поверх Spatie HasRoles)
        Gate::define('verify-users', fn ($user) =>
            $user->hasRole('superadmin') || $user->hasRole('company_admin')
        );

        Gate::define('assign-roles', fn ($user) =>
            $user->hasRole('superadmin')
            || $user->hasRole('company_admin')
            || $user->hasRole('hrd')
        );

        Gate::define('manage-company', fn ($user) =>
            $user->hasRole('superadmin') || $user->hasRole('company_admin')
        );
    }
}
