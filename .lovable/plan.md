## Проблема

`FixCompanyLinks` селектит `p.department_id`, которого нет в таблице `profiles` (там есть только текстовое `department`, а `department_id` живёт, например, в `team_members`/`departments.head_user_id`, но не в профиле). Отсюда `SQLSTATE 42S22`.

Плюс в SQL из ошибки видно вторую проблему: `p.company_id = ''` — пустая строка попадает в биндинг как `""`, что на MySQL с uuid-колонкой валидно, но условие `orWhere('p.company_id', '')` лучше заменить на явную проверку, чтобы не падать в других БД.

## Что поправить в `backend-laravel/app/Console/Commands/FixCompanyLinks.php`

1. Убрать `p.department_id` из `select(...)`.
2. Резолвить отдел иначе (по убыванию достоверности):
   - `positions.department_id` → `departments.company_id` (через `p.position_id`);
   - `team_members`: найти менеджера сотрудника, взять его `profiles.company_id`;
   - `employee_invitations` по `claimed_user_id`/`email`;
   - fallback `--company-id` / `--company-name`.
3. Заменить `orWhere('p.company_id', '')` на безопасный вариант:
   ```php
   ->where(function ($q) {
       $q->whereNull('p.company_id')
         ->orWhereRaw("COALESCE(NULLIF(CAST(p.company_id AS CHAR), ''), '') = ''");
   })
   ```
4. Ветку `departments` для резолва оставить, но брать `department_id` из `positions` (а не из профиля), т.к. в профиле его нет.
5. Мелочи: не вставлять `department_id` в profiles при создании новой строки (колонка не существует) — только `company_id`, `user_id`, `full_name`, `is_verified`, `requested_role`.

## Проверка после правки

На проде:

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
git pull
php artisan optimize:clear
php artisan org:fix-company-links --dry-run --company-name=AIGuild
# если список ок:
php artisan org:fix-company-links --company-name=AIGuild
```

Затем повторить приглашение из-под Дарьи Захаровой — 422 «Не указана компания» должен уйти.

## Технические детали

Схема (`0002_00_37_..._create_profiles_table.php`) подтверждает: в `profiles` есть `company_id`, `position_id`, `department` (text) — но **нет** `department_id`. Резолв через `positions.department_id → departments.company_id` уже даёт нужную компанию, отдельный шаг «по department_id профиля» просто не нужен.
