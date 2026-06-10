# Phase 4 — Policies + BelongsToCompany scope

Заменяем legacy RLS на серверную авторизацию Laravel.

## Архитектура

```
БД (Postgres)         ──  RLS отключаем для роли приложения (`app_user`)
Eloquent global scope ──  CompanyScope: where company_id = auth.user.companyId
Eloquent creating     ──  BelongsToCompany trait: auto-fill company_id
Policies              ──  Gate::authorize() в контроллерах
Middleware            ──  EnsureVerified, EnsureHasCompany, role:hrd|...
```

## Карта политик RLS → Policy

| legacy policy                                  | Laravel policy             |
|--------------------------------------------------|----------------------------|
| profiles `*`                                      | `ProfilePolicy`            |
| companies `*`                                     | `CompanyPolicy`            |
| departments / positions / hr_documents /          | `CompanyScopedPolicy`      |
| position_career_paths / assessment_scenarios      |                            |
| assessments / competencies / achievements /       | `OwnedRecordPolicy`        |
| career_goals / notifications / support_tickets    |                            |
| team_members                                      | `TeamMemberPolicy`         |

## Использование в моделях (Phase 5)

```php
use App\Models\Concerns\BelongsToCompany;

class Department extends Model
{
    use BelongsToCompany;
    protected $fillable = ['name', 'company_id'];
}
```

И в `AuthServiceProvider::$policies`:
```php
Department::class => CompanyScopedPolicy::class,
Assessment::class => OwnedRecordPolicy::class,
TeamMember::class => TeamMemberPolicy::class,
```

## Использование в контроллерах

```php
public function update(Request $r, Department $department)
{
    $this->authorize('update', $department);
    $department->update($r->validated());
    return $department;
}
```

## Superadmin

`BasePolicy::before()` возвращает `true` для роли `superadmin`.
`CompanyScope` для superadmin не применяется.
Импresonation реализуется через Sanctum-actAs или middleware, подменяющий
`auth()->user()` (Phase 6).

## Отключение RLS на стороне БД

В Phase 7 (deployment) роль приложения подключается с `BYPASSRLS`, либо
RLS политики удаляются миграцией. До этого момента совместимости с прямыми
SQL-запросами через legacy JS не теряется.
