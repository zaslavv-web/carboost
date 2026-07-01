<?php

namespace App\Providers;

use App\Models;
use App\Policies\CareerLevelActionPolicy;
use App\Policies\CompanyPolicy;
use App\Policies\CompanyScopedPolicy;
use App\Policies\DemoRequestPolicy;
use App\Policies\GoalChecklistItemPolicy;
use App\Policies\OwnedRecordPolicy;
use App\Policies\ProfilePolicy;
use App\Policies\TeamMemberPolicy;
use App\Policies\TrackerChildPolicy;
use App\Policies\TrackerOwnedPolicy;
use App\Policies\UserRolePolicy;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Gate;

class AuthServiceProvider extends ServiceProvider
{
    /**
     * Карта моделей → политик. Зеркалит RLS-политики legacy.
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
        Models\LeaveRequest::class             => OwnedRecordPolicy::class,
        Models\LeaveBalance::class             => OwnedRecordPolicy::class,
        Models\LeaveCompensation::class        => OwnedRecordPolicy::class,

        // Leave types — справочник компании
        Models\LeaveType::class                => CompanyScopedPolicy::class,

        // Child/admin bridge models used by /api/db/*
        Models\CareerLevelAction::class        => CareerLevelActionPolicy::class,
        Models\GoalChecklistItem::class        => GoalChecklistItemPolicy::class,
        Models\DemoRequest::class              => DemoRequestPolicy::class,
        Models\UserRole::class                 => UserRolePolicy::class,

        // Teams
        Models\TeamMember::class               => TeamMemberPolicy::class,

        // Tracker module
        Models\TrackerProject::class           => CompanyScopedPolicy::class,
        Models\TrackerOkrPeriod::class         => CompanyScopedPolicy::class,
        Models\TrackerGoal::class              => TrackerOwnedPolicy::class,
        Models\TrackerTask::class              => TrackerOwnedPolicy::class,
        Models\TrackerOneOnOne::class          => TrackerOwnedPolicy::class,
        Models\TrackerKeyResult::class         => TrackerChildPolicy::class,
        Models\TrackerTaskGoalLink::class      => TrackerChildPolicy::class,
        Models\TrackerTaskCheckin::class       => TrackerChildPolicy::class,
        Models\TrackerOneOnOneAgenda::class    => TrackerChildPolicy::class,
        Models\TrackerAuditLog::class          => CompanyScopedPolicy::class,
        Models\TrackerWorkflow::class              => CompanyScopedPolicy::class,
        Models\TrackerWorkflowStatus::class        => CompanyScopedPolicy::class,
        Models\TrackerWorkflowTransition::class    => CompanyScopedPolicy::class,
        Models\TrackerSprint::class                => CompanyScopedPolicy::class,
        Models\TrackerComment::class               => TrackerChildPolicy::class,
        Models\TrackerAttachment::class            => TrackerChildPolicy::class,

        // Gamification / Shop / Recognition
        Models\GamificationLevel::class    => CompanyScopedPolicy::class,
        Models\PeerRecognition::class      => \App\Policies\PeerRecognitionPolicy::class,
        Models\PeerRecognitionReaction::class => OwnedRecordPolicy::class,
        Models\ShopProduct::class          => CompanyScopedPolicy::class,
        Models\ShopOrder::class            => \App\Policies\ShopOwnedPolicy::class,
        Models\ShopCartItem::class         => \App\Policies\ShopOwnedPolicy::class,
        Models\ShopOrderItem::class        => OwnedRecordPolicy::class,

        // Onboarding (Волна 1): планы/шаги — HRD/admin; назначения/прогресс — company-scoped
        Models\OnboardingPlan::class         => CompanyScopedPolicy::class,
        Models\OnboardingPlanStep::class     => CompanyScopedPolicy::class,
        Models\OnboardingAssignment::class   => CompanyScopedPolicy::class,
        Models\OnboardingStepProgress::class => CompanyScopedPolicy::class,

        // L&D (Волна 2)
        Models\IndividualDevelopmentPlan::class => OwnedRecordPolicy::class,
        Models\IdpItem::class                   => CompanyScopedPolicy::class,
        Models\KnowledgeCategory::class         => CompanyScopedPolicy::class,
        Models\KnowledgeArticle::class          => CompanyScopedPolicy::class,

        // Performance (Волна 3)
        Models\PerformanceReviewReviewer::class => CompanyScopedPolicy::class,
    ];


    public function boot(): void
    {
        $this->registerPolicies();

        // Superadmin должен проходить любые Gate-проверки, включая модели без policy.
        Gate::before(fn ($user, string $ability) =>
            $user->hasRole('superadmin') ? true : null
        );

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

        // Продуктовая аналитика — только суперадмин
        Gate::define('viewProductAnalytics', fn ($user) => $user->hasRole('superadmin'));
    }
}
