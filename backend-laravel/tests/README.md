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
| `Unit/RpcControllerLocalizeTest`       | mapper Postgres-ошибок → русские строки |
| `Unit/DbControllerSplitTest`           | парсер PostgREST `select=col,rel(a,b),rel2(*)` |

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
