# Backend tests (PHPUnit)

```bash
cd backend-laravel
composer install
php artisan migrate --env=testing --database=sqlite
./vendor/bin/phpunit
# или
php artisan test
```

## Что покрыто

| Suite                                  | Что проверяет |
|----------------------------------------|---------------|
| `Feature/AuthControllerTest`           | register, login, /me, logout, дубликаты email |
| `Feature/GoogleAuthTest`               | Socialite redirect, callback (создание юзера, ошибка → #error=) |
| `Feature/MiddlewareTest`               | EnsureVerified (`pending_verification`), EnsureHasCompany (`missing_company`) |
| `Feature/DbControllerTest`             | whitelisting таблиц, scoping по компании, фильтры eq/in, single→404 |
| `Feature/RpcControllerTest`            | 404 для неизвестных RPC, public-доступ `submit_demo_request`, локализация RLS |
| `Feature/StorageControllerTest`        | загрузка, public URL, 409 при конфликте, удаление, неизвестный bucket |
| `Feature/ImpersonationTest`            | только superadmin, stop → 204 |
| `Feature/AiControllerTest`             | auth-gate, валидация, проброс `AiGatewayException` со статусом, streaming-сервис |
| `Feature/PoliciesTest`                 | сценарии «другая компания → 403», employee не может удалять |
| `Feature/EmployeeReadControllerTest`   | чтение карточек сотрудников, скоуп по компании |
| `Feature/ProfileDirectoryTest`         | директория профилей: email/roles в выдаче, пагинация без полной материализации, cap `per_page` (500 максимум, 0 → 1, >500 → 500 без 5xx) |
| `Feature/EnrollmentCourseAudienceTest` | запись на курсы, аудитория курса, доступ по компании |
| `Feature/PerformanceControllerTest`    | циклы performance review, доступ ролей |
| `Feature/TalentReviewControllerTest`   | talent review матрица, доступ HR/HRD |
| `Feature/CurrencyControllerTest`       | справочник валют, настройки переводов компании |
| `Feature/KedoControllerTest`           | маршруты согласования КЭДО, bulk-рассылка документов, OTP/ПЭП-подписание и hash-chain `kedo_events`, запрет для employee |
| `Feature/ScormControllerTest`          | загрузка SCORM-пакета, cmi-трекинг прогресса, права доступа |
| `Feature/PredictiveControllerTest`     | `/predictive/overview|employees|employees/{id}|drivers|benchmarks|what-if`, CRUD сценариев `whatif_scenarios`, доступ только HR/HRD/company_admin (employee → 403), скоуп по company_id |
| `Feature/TwoFactorControllerTest`      | setup (secret+otpauth), confirm по TOTP-коду и выдача backup-кодов, одноразовость backup-кода, disable, `/auth/login` → `2fa_required`+`challenge_token`, `/auth/2fa/challenge` с верным кодом → sanctum-токен |
| `Feature/SecurityControllerTest`       | кастомные RBAC-роли (CRUD, назначение/снятие участников), `/security/stats`, доступ только admin/HRD (employee → 403), чужая компания → 403; SSO providers / SCIM tokens — только smoke CRUD (реальная SAML/SCIM-интеграция не проверяется, см. тест `test_sso_scim_modules_are_covered_but_require_manual_saml_verification`) |
| `Unit/RpcControllerLocalizeTest`       | mapper Postgres-ошибок → русские строки |
| `Unit/DbControllerSplitTest`           | парсер PostgREST `select=col,rel(a,b),rel2(*)` |

## Что не покрыто

- Реальная SAML/OIDC-аутентификация (подпись assertion, редиректы `/api/sso/{id}/acs|metadata|callback`) и живой SCIM-обмен (`/api/scim/v2/*`) — тестируется только CRUD над `sso_providers`/`scim_tokens`, без реального провайдера.
- Экспорт аудит-лога (`/security/audit/export` в csv/jsonl/cef) и сам просмотр `/security/audit`, `/security/policy` — не покрыты отдельными тестами.
- `PredictiveController::recompute` (тяжёлый пересчёт модели через `AttritionPredictionService`) — не покрыт, т.к. требует замоканных исторических данных для устойчивого ML-пайплайна.
- Полный AI-стриминг (SSE) и провайдер-специфичные ошибки шлюза за пределами happy-path/`AiGatewayException`.
- 1С-интеграция (`0036_..._create_1c_integration_tables`) — отдельного suite нет.
- Онбординг, L&D-модуль (курсы вне SCORM/enrollment), геймификация, чат, трекер задач, pulse-опросы — не имеют собственных Feature-тестов.
- Google OAuth покрыт только на уровне контроллера (без реального похода к Google API, использует моки Socialite).

## SQLite

Все Feature-тесты используют `RefreshDatabase` + in-memory SQLite (см.
`phpunit.xml`). Если миграция требует Postgres-специфики (`uuid`, `jsonb`),
добавь её аналог в `database/migrations/_test/`, либо запусти suite против
выделенной Postgres-БД, прописав в `.env.testing`:

```
DB_CONNECTION=pgsql
DB_DATABASE=growthpeak_test
```

## Helper

`tests/WithDomainUsers` — фабрика реальных юзеров с профилем и ролью:

```php
$super = $this->makeUser('superadmin');
$admin = $this->makeUser('company_admin', $companyId);
$emp   = $this->makeUser('employee', $companyId, verified: false);
$this->actingAs($emp, 'sanctum');
```
