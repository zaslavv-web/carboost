<?php

namespace App\Providers;

use App\Models;
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
     * Карта моделей → политик. Зеркалит RLS-политики Supabase.
     *
     *  CompanyScopedPolicy — справочники компании (view all, manage = hrd|company_admin).
     *  OwnedRecordPolicy   — пользовательские записи (own all, hrd/company_admin read-only).
     *  TeamMemberPolicy    — командные записи (manager своей команды + hrd/company_admin компании).
     *
     * Дочерние модели без company_id (CareerLevelAction, *_files, GoalChecklistItem)
     * авторизуются вручную в контроллерах через родителя.
     */
    protected $policies = [
        // Профили / компании
        Models\Profile::class                  => ProfilePolicy::class,
        Models\Company::class                  => CompanyPolicy::class,

        // Справочники компании
        Models\Department::class               => CompanyScopedPolicy::class,
        Models\Position::class                 => CompanyScopedPolicy::class,
        Models\PositionCareerPath::class       => CompanyScopedPolicy::class,
        Models\HrDocument::class               => CompanyScopedPolicy::class,
        Models\AssessmentScenario::class       => CompanyScopedPolicy::class,
        Models\CareerTrackTemplate::class      => CompanyScopedPolicy::class,
        Models\CareerStepScenario::class       => CompanyScopedPolicy::class,
        Models\ClosedQuestionTest::class       => CompanyScopedPolicy::class,
        Models\GamificationRewardType::class   => CompanyScopedPolicy::class,
        Models\EmailDomainPositionMapping::class => CompanyScopedPolicy::class,
        Models\CompanyCurrencySettings::class  => CompanyScopedPolicy::class,
        Models\CompanyOnboardingSettings::class => CompanyScopedPolicy::class,
        Models\EmployeeInvitation::class       => CompanyScopedPolicy::class,
        Models\EmployeeReward::class           => CompanyScopedPolicy::class,
        Models\EmployeeRiskScore::class        => CompanyScopedPolicy::class,

        // Owned by user
        Models\Achievement::class              => OwnedRecordPolicy::class,
        Models\Assessment::class               => OwnedRecordPolicy::class,
        Models\Competency::class               => OwnedRecordPolicy::class,
        Models\CareerGoal::class               => OwnedRecordPolicy::class,
        Models\Notification::class             => OwnedRecordPolicy::class,
        Models\SupportTicket::class            => OwnedRecordPolicy::class,
        Models\EmployeeCareerAssignment::class => OwnedRecordPolicy::class,
        Models\EmployeeQuestionnaire::class    => OwnedRecordPolicy::class,
        Models\CareerStepSubmission::class     => OwnedRecordPolicy::class,
        Models\CurrencyBalance::class          => OwnedRecordPolicy::class,
        Models\CurrencyTransaction::class      => OwnedRecordPolicy::class,

        // Teams
        Models\TeamMember::class               => TeamMemberPolicy::class,
    ];

    public function boot(): void
    {
        $this->registerPolicies();

        // Глобальные доменные Gates (mirror функций verify_user / assign_role / reject_user)
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

        Gate::define('view-demo-requests', fn ($user) => $user->hasRole('superadmin'));
    }
}
