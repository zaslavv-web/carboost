# Фикс фатальной ошибки PHP и блокировки git pull

## Что произошло

1. **Фатальная ошибка.** В `DbController` метод назван `authorizeResource` и объявлен как `private`. В базовом классе `Controller` (трейт Laravel `AuthorizesRequests`) уже есть публичный метод с тем же именем — PHP запрещает понижать видимость, поэтому падает весь процесс: `Access level to ... authorizeResource() must be public`. Это ломает и тесты в CI, и приложение целиком.
2. `**git pull` на боевом не проходит.** На сервере есть локальные изменения в `package.json` и `.gitignore`, которые перезаписал бы merge. Поэтому новый код (в том числе фиксы 500) на боевой ещё не приехал.

## Что сделать в коде

Переименовать конфликтующий метод в `DbController` в `enforceResourceAccess` (имя не пересекается с трейтом Laravel) и обновить все 4 места вызова: строки 205, 620, 676, 735. Логика метода не меняется — та же проверка ролевой модели с fail-open при исключении.

## Как выкатить на боевой

Локальные правки на сервере в `package.json` и `.gitignore` не нужны (бэкенд-каталог не должен расходиться с репозиторием):

```
cd /home/gro7659365/growth-peak.pro/docs/backend
git stash push -- package.json .gitignore   # либо git checkout -- package.json .gitignore
git pull
php artisan migrate --force
php artisan optimize:clear
```

Если файлы в стеше не понадобятся — `git stash drop`.

## Проверка после выката

```
php artisan test --filter=DbController
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://growth-peak.pro/api/db/positions?select=id,title,department&order=title.asc&limit=200"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://growth-peak.pro/api/db/profiles?select=company_id&maybeSingle=1&eq.user_id=1041"


[gro7659365@gro7659365 backend]$ git stash push -- package.json .gitignore   # либо git checkout -- package.json .gitignore
Saved working directory and index state WIP on main: e4b47948 Исправил валидацию UUID
[gro7659365@gro7659365 backend]$ git pull
remote: Enumerating objects: 7, done.
remote: Counting objects: 100% (7/7), done.
remote: Compressing objects: 100% (3/3), done.
remote: Total 5 (delta 2), reused 5 (delta 2), pack-reused 0 (from 0)
Unpacking objects: 100% (5/5), 1.86 KiB | 1.86 MiB/s, done.
From https://github.com/zaslavv-web/carboost
   9ce6dda7..6931ccd0  main       -> origin/main
Updating e4b47948..6931ccd0
Fast-forward
 .github/workflows/tests.yml                        |  117 +
 .gitignore                                         |    4 +
 .lovable/plan.md                                   |   37 +
 ...264\320\265-\320\270-\320\262-ci-2026-08-21.md" |   25 +
 ...320\270-\321\203\321\201\320\272-2026-08-23.md" |   53 +
 ...\321\200\320\276\320\272\320\260-2026-08-21.md" |   37 +
 ...\321\200\320\262\320\265\321\200-2026-08-21.md" |   29 +
 ...\320\265\320\275\321\202\320\260-2026-08-21.md" |   41 +
 ...\321\200\320\276\320\270\320\267-2026-08-21.md" |   31 +
 ...\320\260\321\200\320\270\321\217-2026-08-23.md" |   21 +
 ...\320\265\320\272\320\276\320\262-2026-08-22.md" |   42 +
 ...\320\265\320\272\320\276\320\262-2026-08-21.md" |   44 +
 ...20\270-\320\262-\320\264\320\265-2026-08-21.md" |   35 +
 ...\321\200\320\265\320\275\320\270-2026-08-22.md" |   50 +
 ...\320\276\321\200\320\270\320\270-2026-08-23.md" |   23 +
 ...321\200\320\270\321\217-\320\270-2026-08-24.md" |   28 +
 ...\320\265\321\202\320\272\321\203-2026-08-23.md" |   37 +
 ...0\270\321\217-\320\270-demo-doom-2026-08-23.md" |   29 +
 ...20\275\320\270\320\265-demo-doom-2026-08-24.md" |  106 +
 ...\321\202\320\265\320\275\321\202-2026-08-23.md" |   46 +
 ...\321\203\320\267\320\272\320\270-2026-08-19.md" |   32 +
 ...\321\202\321\200\320\265\320\272-2026-08-21.md" |   40 +
 ...\202-\320\275\320\260-setup-node-2026-08-21.md" |   23 +
 ...\321\203\321\202\320\276\320\262-2026-08-21.md" |   30 +
 ...\320\261\320\273\320\276\320\272-2026-08-24.md" |   27 +
 backend-laravel/.env.testing                       |   22 +
 backend-laravel/.gitignore                         |   19 +
 .../app/Console/Commands/SeedDemoCompany.php       | 1938 ++++-
 .../app/Console/Commands/SeedTrackerTasks.php      |  121 +-
 .../Controllers/Api/AccessControlController.php    |  342 +
 .../Controllers/Api/Admin/DemoSeedController.php   |  171 +-
 .../Http/Controllers/Api/AiSettingsController.php  |   13 +
 .../Http/Controllers/Api/Auth/AuthController.php   |    7 +-
 .../Api/CareerSubmissionFileController.php         |   25 +
 .../Api/CareerTrackInsightController.php           |  508 ++
 .../Api/ClosedQuestionTestController.php           |    5 +
 .../app/Http/Controllers/Api/CourseController.php  |   69 +-
 .../app/Http/Controllers/Api/DbController.php      |   57 +
 .../Http/Controllers/Api/EnrollmentController.php  |   26 +-
 .../Controllers/Api/HrTaskAudienceController.php   |  223 +
 .../app/Http/Controllers/Api/HrdMapController.php  |   93 +
 .../app/Http/Controllers/Api/KedoController.php    |   14 +-
 .../Controllers/Api/LeaveBalanceController.php     |    2 +-
 .../Controllers/Api/LeaveRequestController.php     |    2 +-
 .../Controllers/Api/OneCIntegrationController.php  |    3 +-
 .../Controllers/Api/PeopleAnalyticsController.php  |   54 +-
 .../Http/Controllers/Api/PerformanceController.php |  122 +-
 .../Api/PortalInteractionController.php            |   83 +
 .../Http/Controllers/Api/PredictiveController.php  |  371 +
 .../app/Http/Controllers/Api/RpcController.php     |  299 +-
 .../app/Http/Controllers/Api/ScormController.php   |  878 +-
 .../Http/Controllers/Api/SecurityController.php    |    2 +-
 .../app/Http/Controllers/Api/StorageController.php |   62 +-
 .../Api/UniversityAnalyticsController.php          |  168 +
 .../app/Http/Controllers/Api/WebhookController.php |    2 +-
 backend-laravel/app/Models/ClosedQuestionTest.php  |    8 +-
 backend-laravel/app/Models/Company.php             |    2 +-
 backend-laravel/app/Models/HrTask.php              |    3 +-
 backend-laravel/app/Models/HrdChecklistItem.php    |   26 +
 backend-laravel/app/Models/PortalCommunity.php     |    2 +-
 .../app/Models/PortalCommunityMember.php           |   14 +
 backend-laravel/app/Models/PortalPostComment.php   |   20 +
 backend-laravel/app/Models/PortalPostReaction.php  |   20 +
 backend-laravel/app/Models/Profile.php             |   18 +
 backend-laravel/app/Policies/BasePolicy.php        |   11 +-
 backend-laravel/app/Policies/ProfilePolicy.php     |    7 +-
 .../app/Providers/AuthServiceProvider.php          |    1 +
 .../Analytics/AttritionPredictionService.php       |  496 ++
 backend-laravel/app/Support/RichTextSanitizer.php  |   68 +
 backend-laravel/artisan                            |   14 +
 backend-laravel/bootstrap/app.php                  |    4 +
 backend-laravel/bootstrap/cache/.gitignore         |    2 +
 backend-laravel/bootstrap/providers.php            |    5 +
 backend-laravel/composer.json                      |   65 +
 backend-laravel/composer.lock                      | 9117 ++++++++++++++++++++
 backend-laravel/config/filesystems.php             |    1 +
 ...00_15_000000_create_currency_balances_table.php |    2 +-
 .../0003_00_00_000000_seed_test_users.php          |   34 +-
 .../0030_00_00_000000_fix_missing_timestamps.php   |   21 +
 ...30_00_01_000000_fix_missing_column_defaults.php |    5 +
 ...0030_00_02_000000_bulk_fix_missing_defaults.php |    5 +
 ...0000_make_created_by_nullable_hr_and_tracks.php |    5 +
 ...0_000000_create_predictive_analytics_tables.php |  209 +
 ...00_00_000000_add_chain_index_to_kedo_events.php |   52 +
 .../0042_00_00_000000_add_course_editors.php       |   26 +
 .../0043_00_00_000000_add_hr_task_audience.php     |   27 +
 ..._00_000000_add_career_track_insight_indexes.php |   61 +
 ...0000_add_community_avatar_and_test_audience.php |   36 +
 ...046_00_00_000000_create_hrd_checklist_items.php |   28 +
 .../0047_00_00_000000_create_role_permissions.php  |   42 +
 ...00_00_000000_create_access_permission_rules.php |   60 +
 backend-laravel/phpunit.xml                        |    7 +-
 backend-laravel/public/index.php                   |   17 +
 backend-laravel/routes/api.php                     |   67 +-
 backend-laravel/storage/app/public/.gitkeep        |    0
 .../storage/framework/cache/data/.gitkeep          |    0
 .../storage/framework/sessions/.gitkeep            |    0
 .../assets/scorm.js                                |    1 +
 .../assets/style.css                               |    1 +
 .../imsmanifest.xml                                |    8 +
 .../package.zip                                    |  Bin 0 -> 1184 bytes
 .../pages/01-intro.html                            |    1 +
 .../pages/02-start.html                            |    1 +
 .../pages/quiz.html                                |    1 +
 backend-laravel/storage/framework/views/.gitkeep   |    0
 backend-laravel/tests/Feature/AiControllerTest.php |    6 +-
 .../tests/Feature/CurrencyControllerTest.php       |  185 +
 .../tests/Feature/EnrollmentCourseAudienceTest.php |  141 +
 .../tests/Feature/ImpersonationTest.php            |    5 +-
 .../tests/Feature/KedoControllerTest.php           |  122 +
 .../tests/Feature/PerformanceControllerTest.php    |   73 +
 .../tests/Feature/PredictiveControllerTest.php     |  187 +
 .../tests/Feature/ProfileDirectoryTest.php         |   26 +-
 .../tests/Feature/RpcControllerTest.php            |    8 +-
 .../tests/Feature/ScormControllerTest.php          |  516 ++
 .../tests/Feature/SecurityControllerTest.php       |  152 +
 .../tests/Feature/TalentReviewControllerTest.php   |   84 +
 .../tests/Feature/TwoFactorControllerTest.php      |  151 +
 backend-laravel/tests/README.md                    |   21 +
 .../tests/Unit/CareerTrackAssignmentRulesTest.php  |   53 +
 .../tests/Unit/HrTaskAudienceRulesTest.php         |   29 +
 .../tests/Unit/RichTextSanitizerTest.php           |   46 +
 backend-laravel/tests/bootstrap.php                |    9 +
 bun.lock                                           |  117 +
 docs/LOAD-TEST-REPORT.md                           |   38 +
 docs/TESTING.md                                    |   95 +
 docs/loadtest/2026-08-19T01-44-50-421Z.json        |  170 +
 docs/loadtest/2026-08-19T01-45-38-970Z.json        |  170 +
 package.json                                       |   19 +-
 playwright.config.ts                               |   41 +-
 public/demo/community-cover.jpg                    |  Bin 0 -> 107542 bytes
 public/demo/community-team.jpg                     |  Bin 0 -> 100728 bytes
 scripts/loadtest/k6-100vu.js                       |   71 +
 scripts/loadtest/load-test.mjs                     |  345 +
 src/App.tsx                                        |   43 +-
 src/components/AppSidebar.tsx                      |   35 +-
 src/components/CareerTrackTestsTable.tsx           |  162 +
 src/components/HRDCareerTracksAnalytics.tsx        |  402 +-
 src/components/HRDEmployeeMap.tsx                  |  496 +-
 src/components/RoleOnly.tsx                        |   24 +
 src/components/ScenarioSchemaViewer.tsx            |  736 +-
 .../__tests__/ScenarioSchemaViewer.test.tsx        |   29 +
 src/components/chat/MessageBubble.tsx              |    6 +-
 src/components/landing/ModuleIcons.tsx             |   92 +
 src/components/landing/ModulesGrouped.tsx          |    4 +-
 src/components/tracker/Badges.tsx                  |   12 +-
 src/components/ui/rich-content.tsx                 |   11 +
 src/components/ui/rich-text-editor.tsx             |  161 +
 src/components/university/CourseEditors.tsx        |  101 +
 src/components/university/MyLearningBlock.tsx      |   74 +
 src/components/university/ScormUploadDialog.tsx    |   11 +-
 src/contexts/__tests__/LaravelAuthContext.test.tsx |   18 +-
 src/data/features.ts                               |   39 +-
 src/e2e/api/smoke.spec.ts                          |  124 +
 src/e2e/support/api.ts                             |   85 +
 src/e2e/ui/roles.spec.ts                           |   94 +
 src/hooks/useAccessPermissions.ts                  |   38 +
 src/i18n/locales/en/common.json                    |   11 +-
 src/i18n/locales/en/landing.json                   |  823 +-
 src/i18n/locales/ru/common.json                    |   11 +-
 src/i18n/locales/ru/landing.json                   |  746 +-
 src/integrations/laravel/__tests__/chat.test.ts    |  100 +
 src/integrations/laravel/__tests__/kedo.test.ts    |   92 +
 src/integrations/laravel/__tests__/leaves.test.ts  |  102 +
 src/integrations/laravel/__tests__/oneC.test.ts    |  107 +
 .../laravel/__tests__/performance.test.ts          |  104 +
 .../laravel/__tests__/predictive.test.ts           |   76 +
 .../laravel/__tests__/security.test.ts             |   94 +
 .../laravel/__tests__/talentReview.test.ts         |   82 +
 src/integrations/laravel/client.ts                 |    2 +-
 src/integrations/laravel/performance.ts            |   34 +
 src/integrations/laravel/predictive.ts             |  174 +
 src/lib/analytics/tracker.ts                       |    6 +-
 src/lib/richText.ts                                |   24 +
 src/pages/AccessControl.tsx                        |   83 +
 src/pages/AdaptationPlans.tsx                      |  140 +-
 src/pages/Assessment.tsx                           |   12 +-
 src/pages/CareerReviews.tsx                        |    9 +-
 src/pages/CareerTracksManagement.tsx               |   37 +-
 src/pages/Communities.tsx                          |   65 +-
 src/pages/CorporateFeed.tsx                        |   96 +-
 src/pages/CourseAuthoring.tsx                      |   34 +-
 src/pages/CourseView.tsx                           |  137 +-
 src/pages/EmployeeCareerTrack.tsx                  |  298 +
 src/pages/EmployeeMapPage.tsx                      |   12 +
 src/pages/HRDDashboard.tsx                         |   38 +-
 src/pages/HRDTests.tsx                             |  176 +-
 src/pages/HRPolicies.tsx                           |  156 +-
 src/pages/HrDocumentsPersonal.tsx                  |   70 +-
 src/pages/Landing.tsx                              |    2 +-
 src/pages/Leaves.tsx                               |  116 +-
 src/pages/ManagerDashboard.tsx                     |    4 +-
 src/pages/MyOrders.tsx                             |    7 +-
 src/pages/Onboarding.tsx                           |   57 +-
 src/pages/OrderDetail.tsx                          |  114 +
 src/pages/PeopleAnalytics.tsx                      |   39 +-
 src/pages/Performance.tsx                          |    9 +-
 src/pages/PerformanceCycleDetail.tsx               |  355 +
 src/pages/PerformanceReview360.tsx                 |  149 +-
 src/pages/PredictiveAnalytics.tsx                  |  491 ++
 src/pages/PulseSurveys.tsx                         |   12 +-
 src/pages/Recognition.tsx                          |   11 +-
 src/pages/RiskAnalytics.tsx                        |   21 +-
 src/pages/SeedDemoCompany.tsx                      |  140 +-
 src/pages/ShopAdmin.tsx                            |   93 +-
 src/pages/SkillsMatrix.tsx                         |  131 +-
 src/pages/University.tsx                           |   48 +-
 src/pages/UniversityAnalytics.tsx                  |  212 +
 src/pages/UsersManagement.tsx                      |  115 +-
 src/pages/employee/EmployeeToday.tsx               |    3 +
 src/pages/tracker/TrackerLayout.tsx                |   13 -
 src/test/product-buttons.smoke.test.tsx            |   76 +-
 src/test/setup.ts                                  |    9 +
 src/test/users-risk-filter.test.tsx                |   87 +
 214 files changed, 27941 insertions(+), 1310 deletions(-)
 create mode 100644 .github/workflows/tests.yml
 create mode 100644 .lovable/plan.md
 create mode 100644 ".lovable/plan/composer-lock-\320\275\320\265\321\201\320\276\320\262\320\274\320\265\321\201\321\202\320\270\320\274-\321\201-php-8-2-\320\275\320\260-\320\277\321\200\320\276\320\264\320\265-\320\270-\320\262-ci-2026-08-21.md"
 create mode 100644 ".lovable/plan/performance-\320\264\320\265\321\202\320\260\320\273\320\270\320\267\320\260\321\206\320\270\321\217-\321\206\320\270\320\272\320\273\320\276\320\262-\320\275\320\260\320\277\320\276\320\273\320\275\320\265\320\275\320\270\320\265-\320\264\320\265\320\274\320\276-\320\264\320\260\320\275\320\275\321\213\320\274\320\270-\320\270-\321\203\321\201\320\272-2026-08-23.md"
 create mode 100644 ".lovable/plan/scorm-401-\320\277\321\200\320\270-\320\276\321\202\320\272\321\200\321\213\321\202\320\270\320\270-\321\203\321\200\320\276\320\272\320\260-2026-08-21.md"
 create mode 100644 ".lovable/plan/scorm-404-\320\275\320\260-pages-01-intro-html-\320\277\320\260\320\272\320\265\321\202-\320\270\321\201\320\277\321\200\320\260\320\262\320\265\320\275-\321\207\320\270\320\275\320\270\320\274-\321\201\320\265\321\200\320\262\320\265\321\200-2026-08-21.md"
 create mode 100644 ".lovable/plan/scorm-\321\203\321\200\320\276\320\272\320\270-\320\270-\320\265\320\264\320\270\320\275\321\213\320\271-\321\200\320\265\320\264\320\260\320\272\321\202\320\276\321\200-\320\272\320\276\320\275\321\202\320\265\320\275\321\202\320\260-2026-08-21.md"
 create mode 100644 ".lovable/plan/\320\261\321\215\320\272\320\265\320\275\320\264-\320\262-ci-\320\272\320\276\320\274\320\274\320\270\321\202\320\270\320\274-\320\272\320\260\321\200\320\272\320\260\321\201-laravel-\320\270-\320\264\320\265\320\273\320\260\320\265\320\274-\321\201\320\261\320\276\321\200\320\272\321\203-\320\262\320\276\321\201\320\277\321\200\320\276\320\270\320\267-2026-08-21.md"
 create mode 100644 ".lovable/plan/\320\267\320\260\320\262\320\265\321\200\321\210\320\265\320\275\320\270\320\265-\320\277\320\276\320\273\320\275\320\276\320\263\320\276-hrd-\321\201\321\206\320\265\320\275\320\260\321\200\320\270\321\217-2026-08-23.md"
 create mode 100644 ".lovable/plan/\320\270\321\201\320\277\321\200\320\260\320\262\320\270\321\202\321\214-422-\320\277\321\200\320\270-\320\275\320\260\320\267\320\275\320\260\321\207\320\265\320\275\320\270\320\270-\320\272\320\260\321\200\321\214\320\265\321\200\320\275\321\213\321\205-\321\202\321\200\320\265\320\272\320\276\320\262-2026-08-22.md"
 create mode 100644 ".lovable/plan/\320\270\321\201\320\277\321\200\320\260\320\262\320\270\321\202\321\214-\320\263\320\265\320\275\320\265\321\200\320\260\321\206\320\270\321\216-\320\270-\320\262\321\213\320\264\320\260\321\207\321\203-\320\272\320\260\321\200\321\214\320\265\321\200\320\275\321\213\321\205-\321\202\321\200\320\265\320\272\320\276\320\262-2026-08-21.md"
 create mode 100644 ".lovable/plan/\320\272\320\260\321\200\321\202\320\260-\321\201\320\276\321\202\321\200\321\203\320\264\320\275\320\270\320\272\320\276\320\262-\320\276\321\202\320\264\320\265\320\273\321\214\320\275\320\276\320\265-\320\276\320\272\320\275\320\276-\320\275\320\260\320\267\320\275\320\260\321\207\320\265\320\275\320\270\320\265-\320\267\320\260\320\264\320\260\321\207-\321\202\321\200\320\265\320\272\320\270-\320\262-\320\264\320\265-2026-08-21.md"
 create mode 100644 ".lovable/plan/\320\272\320\260\321\200\321\214\320\265\321\200\320\275\321\213\320\265-\321\202\321\200\320\265\320\272\320\270-\320\264\320\265\321\202\320\260\320\273\320\270\320\267\320\260\321\206\320\270\321\217-\320\277\320\276-\321\201\320\276\321\202\321\200\321\203\320\264\320\275\320\270\320\272\321\203-\320\260\320\275\320\260\320\273\320\270\321\202\320\270\320\272\320\260-\321\203\321\201\320\272\320\276\321\200\320\265\320\275\320\270-2026-08-22.md"
 create mode 100644 ".lovable/plan/\320\272\321\200\320\260\321\201\320\275\321\213\320\271-\320\277\321\200\320\276\320\263\320\276\320\275-ci-\320\276\321\202-\321\201\321\202\320\260\321\200\320\276\320\263\320\276-\320\272\320\276\320\274\320\274\320\270\321\202\320\260-\321\204\320\270\320\272\321\201-\321\203\320\266\320\265-\320\262-\321\200\320\265\320\277\320\276\320\267\320\270\321\202\320\276\321\200\320\270\320\270-2026-08-23.md"
 create mode 100644 ".lovable/plan/\320\276\320\264\320\270\320\275-\321\200\320\265\320\273\320\270\320\267-\320\264\320\265\320\277\320\273\320\276\320\271-\320\275\320\260\320\272\320\276\320\277\320\273\320\265\320\275\320\275\321\213\321\205-\321\204\320\270\320\272\321\201\320\276\320\262-\320\264\320\276\320\261\320\270\320\262\320\272\320\260-hrd-\321\201\321\206\320\265\320\275\320\260\321\200\320\270\321\217-\320\270-2026-08-24.md"
 create mode 100644 ".lovable/plan/\320\277\320\260\320\264\320\260\320\265\321\202-richtextsanitizertest-\321\201\320\260\320\275\320\270\321\202\320\260\320\271\320\267\320\265\321\200-\321\202\320\265\321\200\321\217\320\265\321\202-\321\200\320\260\320\267\320\274\320\265\321\202\320\272\321\203-2026-08-23.md"
 create mode 100644 ".lovable/plan/\320\277\320\276\320\273\320\275\320\276\320\265-\320\267\320\260\320\272\321\200\321\213\321\202\320\270\320\265-hrd-\321\201\321\206\320\265\320\275\320\260\321\200\320\270\321\217-\320\270-demo-doom-2026-08-23.md"
 create mode 100644 ".lovable/plan/\320\277\320\276\320\273\320\275\320\276\320\265-\320\270\321\201\320\277\321\200\320\260\320\262\320\273\320\265\320\275\320\270\320\265-hrd-\321\201\321\206\320\265\320\275\320\260\321\200\320\270\321\217-\320\270-\320\275\320\260\320\277\320\276\320\273\320\275\320\265\320\275\320\270\320\265-demo-doom-2026-08-24.md"
 create mode 100644 ".lovable/plan/\320\277\320\276\320\273\320\275\321\213\320\271-hrd-\321\201\321\206\320\265\320\275\320\260\321\200\320\270\320\271-\320\270-\320\264\320\265\320\274\320\276-\320\272\320\276\320\275\321\202\320\265\320\275\321\202-2026-08-23.md"
 create mode 100644 ".lovable/plan/\320\277\320\276\321\207\320\265\320\274\321\203-scorm-\320\272\321\203\321\200\321\201-\320\277\321\200\320\276\320\277\320\260\320\264\320\260\320\265\321\202-\320\277\320\276\321\201\320\273\320\265-\320\267\320\260\320\263\321\200\321\203\320\267\320\272\320\270-2026-08-19.md"
 create mode 100644 ".lovable/plan/\320\277\320\276\321\207\320\265\320\274\321\203-\320\272\320\275\320\276\320\277\320\272\320\260-\321\201\320\276\320\267\320\264\320\260\321\221\321\202-\321\202\320\276\320\273\321\214\320\272\320\276-1-\320\272\320\260\321\200\321\214\320\265\321\200\320\275\321\213\320\271-\321\202\321\200\320\265\320\272-2026-08-21.md"
 create mode 100644 ".lovable/plan/\320\277\320\276\321\207\320\270\320\275\320\272\320\260-ci-workflow-tests-\320\277\320\260\320\264\320\260\320\265\321\202-\320\275\320\260-setup-node-2026-08-21.md"
 create mode 100644 ".lovable/plan/\320\277\320\276\321\207\320\270\320\275\320\272\320\260-\320\264\320\265\320\277\320\273\320\276\321\217-route-cache-\320\277\320\260\320\264\320\260\320\265\321\202-\320\270\320\267-\320\267\320\260-\320\264\321\203\320\261\320\273\321\217-\320\270\320\274\321\221\320\275-\320\274\320\260\321\200\321\210\321\200\321\203\321\202\320\276\320\262-2026-08-21.md"
 create mode 100644 ".lovable/plan/\321\201\321\205\320\265\320\274\320\260-\321\201\321\206\320\265\320\275\320\260\321\200\320\270\321\217-\320\276\321\206\320\265\320\275\320\272\320\270-\320\277\320\276\320\272\320\260\320\267\321\213\320\262\320\260\320\265\321\202-\321\202\320\276\320\273\321\214\320\272\320\276-\320\276\320\264\320\270\320\275-\320\261\320\273\320\276\320\272-2026-08-24.md"
 create mode 100644 backend-laravel/.env.testing
 create mode 100644 backend-laravel/app/Http/Controllers/Api/AccessControlController.php
 create mode 100644 backend-laravel/app/Http/Controllers/Api/CareerSubmissionFileController.php
 create mode 100644 backend-laravel/app/Http/Controllers/Api/CareerTrackInsightController.php
 create mode 100644 backend-laravel/app/Http/Controllers/Api/HrTaskAudienceController.php
 create mode 100644 backend-laravel/app/Http/Controllers/Api/HrdMapController.php
 create mode 100644 backend-laravel/app/Http/Controllers/Api/PortalInteractionController.php
 create mode 100644 backend-laravel/app/Http/Controllers/Api/PredictiveController.php
 create mode 100644 backend-laravel/app/Http/Controllers/Api/UniversityAnalyticsController.php
 create mode 100644 backend-laravel/app/Models/HrdChecklistItem.php
 create mode 100644 backend-laravel/app/Services/Analytics/AttritionPredictionService.php
 create mode 100644 backend-laravel/app/Support/RichTextSanitizer.php
 create mode 100755 backend-laravel/artisan
 create mode 100644 backend-laravel/bootstrap/cache/.gitignore
 create mode 100644 backend-laravel/bootstrap/providers.php
 create mode 100644 backend-laravel/composer.json
 create mode 100644 backend-laravel/composer.lock
 create mode 100644 backend-laravel/database/migrations/0040_00_00_000000_create_predictive_analytics_tables.php
 create mode 100644 backend-laravel/database/migrations/0041_00_00_000000_add_chain_index_to_kedo_events.php
 create mode 100644 backend-laravel/database/migrations/0042_00_00_000000_add_course_editors.php
 create mode 100644 backend-laravel/database/migrations/0043_00_00_000000_add_hr_task_audience.php
 create mode 100644 backend-laravel/database/migrations/0044_00_00_000000_add_career_track_insight_indexes.php
 create mode 100644 backend-laravel/database/migrations/0045_00_00_000000_add_community_avatar_and_test_audience.php
 create mode 100644 backend-laravel/database/migrations/0046_00_00_000000_create_hrd_checklist_items.php
 create mode 100644 backend-laravel/database/migrations/0047_00_00_000000_create_role_permissions.php
 create mode 100644 backend-laravel/database/migrations/0050_00_00_000000_create_access_permission_rules.php
 create mode 100644 backend-laravel/public/index.php
 create mode 100644 backend-laravel/storage/app/public/.gitkeep
 create mode 100644 backend-laravel/storage/framework/cache/data/.gitkeep
 create mode 100644 backend-laravel/storage/framework/sessions/.gitkeep
 create mode 100644 backend-laravel/storage/framework/testing/disks/scorm-packages/a292f9c5-e363-4922-9b87-62320e1a45e8/7813f9f9-6ab8-49e1-9104-a0a6f49d7fee/assets/scorm.js
 create mode 100644 backend-laravel/storage/framework/testing/disks/scorm-packages/a292f9c5-e363-4922-9b87-62320e1a45e8/7813f9f9-6ab8-49e1-9104-a0a6f49d7fee/assets/style.css
 create mode 100644 backend-laravel/storage/framework/testing/disks/scorm-packages/a292f9c5-e363-4922-9b87-62320e1a45e8/7813f9f9-6ab8-49e1-9104-a0a6f49d7fee/imsmanifest.xml
 create mode 100644 backend-laravel/storage/framework/testing/disks/scorm-packages/a292f9c5-e363-4922-9b87-62320e1a45e8/7813f9f9-6ab8-49e1-9104-a0a6f49d7fee/package.zip
 create mode 100644 backend-laravel/storage/framework/testing/disks/scorm-packages/a292f9c5-e363-4922-9b87-62320e1a45e8/7813f9f9-6ab8-49e1-9104-a0a6f49d7fee/pages/01-intro.html
 create mode 100644 backend-laravel/storage/framework/testing/disks/scorm-packages/a292f9c5-e363-4922-9b87-62320e1a45e8/7813f9f9-6ab8-49e1-9104-a0a6f49d7fee/pages/02-start.html
 create mode 100644 backend-laravel/storage/framework/testing/disks/scorm-packages/a292f9c5-e363-4922-9b87-62320e1a45e8/7813f9f9-6ab8-49e1-9104-a0a6f49d7fee/pages/quiz.html
 create mode 100644 backend-laravel/storage/framework/views/.gitkeep
 create mode 100644 backend-laravel/tests/Feature/CurrencyControllerTest.php
 create mode 100644 backend-laravel/tests/Feature/EnrollmentCourseAudienceTest.php
 create mode 100644 backend-laravel/tests/Feature/KedoControllerTest.php
 create mode 100644 backend-laravel/tests/Feature/PerformanceControllerTest.php
 create mode 100644 backend-laravel/tests/Feature/PredictiveControllerTest.php
 create mode 100644 backend-laravel/tests/Feature/ScormControllerTest.php
 create mode 100644 backend-laravel/tests/Feature/SecurityControllerTest.php
 create mode 100644 backend-laravel/tests/Feature/TalentReviewControllerTest.php
 create mode 100644 backend-laravel/tests/Feature/TwoFactorControllerTest.php
 create mode 100644 backend-laravel/tests/Unit/CareerTrackAssignmentRulesTest.php
 create mode 100644 backend-laravel/tests/Unit/HrTaskAudienceRulesTest.php
 create mode 100644 backend-laravel/tests/Unit/RichTextSanitizerTest.php
 create mode 100644 backend-laravel/tests/bootstrap.php
 create mode 100644 docs/LOAD-TEST-REPORT.md
 create mode 100644 docs/TESTING.md
 create mode 100644 docs/loadtest/2026-08-19T01-44-50-421Z.json
 create mode 100644 docs/loadtest/2026-08-19T01-45-38-970Z.json
 create mode 100644 public/demo/community-cover.jpg
 create mode 100644 public/demo/community-team.jpg
 create mode 100644 scripts/loadtest/k6-100vu.js
 create mode 100644 scripts/loadtest/load-test.mjs
 create mode 100644 src/components/CareerTrackTestsTable.tsx
 create mode 100644 src/components/RoleOnly.tsx
 create mode 100644 src/components/__tests__/ScenarioSchemaViewer.test.tsx
 create mode 100644 src/components/ui/rich-content.tsx
 create mode 100644 src/components/ui/rich-text-editor.tsx
 create mode 100644 src/components/university/CourseEditors.tsx
 create mode 100644 src/components/university/MyLearningBlock.tsx
 create mode 100644 src/e2e/api/smoke.spec.ts
 create mode 100644 src/e2e/support/api.ts
 create mode 100644 src/e2e/ui/roles.spec.ts
 create mode 100644 src/hooks/useAccessPermissions.ts
 create mode 100644 src/integrations/laravel/__tests__/chat.test.ts
 create mode 100644 src/integrations/laravel/__tests__/kedo.test.ts
 create mode 100644 src/integrations/laravel/__tests__/leaves.test.ts
 create mode 100644 src/integrations/laravel/__tests__/oneC.test.ts
 create mode 100644 src/integrations/laravel/__tests__/performance.test.ts
 create mode 100644 src/integrations/laravel/__tests__/predictive.test.ts
 create mode 100644 src/integrations/laravel/__tests__/security.test.ts
 create mode 100644 src/integrations/laravel/__tests__/talentReview.test.ts
 create mode 100644 src/integrations/laravel/predictive.ts
 create mode 100644 src/lib/richText.ts
 create mode 100644 src/pages/AccessControl.tsx
 create mode 100644 src/pages/EmployeeCareerTrack.tsx
 create mode 100644 src/pages/EmployeeMapPage.tsx
 create mode 100644 src/pages/OrderDetail.tsx
 create mode 100644 src/pages/PerformanceCycleDetail.tsx
 create mode 100644 src/pages/PredictiveAnalytics.tsx
 create mode 100644 src/pages/UniversityAnalytics.tsx
 create mode 100644 src/test/users-risk-filter.test.tsx
[gro7659365@gro7659365 backend]$ php artisan migrate --force

   INFO  Nothing to migrate.

[gro7659365@gro7659365 backend]$ php artisan optimize:clear

   INFO  Clearing cached bootstrap files.

  cache .......................................................... 4.05ms DONE
  compiled ....................................................... 0.79ms DONE
  config ......................................................... 0.61ms DONE
  events ......................................................... 0.52ms DONE
  routes ......................................................... 0.60ms DONE
  views .......................................................... 7.27ms DONE

[gro7659365@gro7659365 backend]$ php artisan test --filter=DbController
PHP Fatal error:  Access level to App\Http\Controllers\Api\DbController::authorizeResource() must be public (as in class App\Http\Controllers\Controller) in /home/gro7659365/growth-peak.pro/docs/backend/app/Http/Controllers/Api/DbController.php on line 964

Fatal error: Access level to App\Http\Controllers\Api\DbController::authorizeResource() must be public (as in class App\Http\Controllers\Controller) in /home/gro7659365/growth-peak.pro/docs/backend/app/Http/Controllers/Api/DbController.php on line 964
[gro7659365@gro7659365 backend]$ curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
>   "https://growth-peak.pro/api/db/positions?select=id,title,department&order=title.asc&limit=200"
500
[gro7659365@gro7659365 backend]$ curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
>   "https://growth-peak.pro/api/db/profiles?select=company_id&maybeSingle=1&eq.user_id=1041"
500

```

Ожидаем зелёные тесты и 200/200. Ошибка React #301 в браузере — следствие падения этих запросов, отдельной правки не требует; перепроверим после выката.