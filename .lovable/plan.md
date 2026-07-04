## Что реально видно в логах

**BUG-A (schema drift, medium)** — таблица `team_members` в MySQL прода не имеет колонки `updated_at`:

```
insert ignore into `team_members` (`id`, `company_id`, `manager_id`, `employee_id`, `created_at`, `updated_at`) values (...)
→ Unknown column 'updated_at'
```

Ошибка ловится в `SeedDemoCompany::assignManagers()` (строка 380). Значит миграция, добавляющая timestamps в `team_members`, на прод не доехала.

**BUG-B (schema drift, medium)** — таблица `employee_career_assignments` не имеет `created_at`:

```
select * from `employee_career_assignments` order by `created_at` desc limit 1
→ Unknown column 'created_at' in 'order clause'
```

**BUG-C (register_company, отдельно, статус пока неясен)** — мой прямой curl вернул 422 «Ошибка выполнения операции», но в присланном grep этой ошибки нет. Нужен ещё один кусок лога, см. Шаг 0 ниже.

**Отменяю панику по «архитектурному» BUG-CRITICAL из прошлого сообщения** — `demo:seed` из логов работает как pure-PHP/Eloquent (без Postgres-функций), и падает НЕ на архитектуре, а на банально недоехавших миграциях. Значит основной pipeline рабочий, лечим точечно.

## Ключевая находка

В коде уже есть готовая команда `demo:seed` (`app/Console/Commands/SeedDemoCompany.php`) и HTTP-роут `/superadmin/demo-seed` (`SuperadminOnly`). Она создаёт демо-компанию со всеми модулями (сотрудники, отделы, треки, роли, менеджерские связки). Именно её вы уже пытались запустить 3 июля в 23:07-23:48 — и она упала на BUG-A.

Значит нам не нужно 3 часа Playwright'ом кликать по фронту. Правильный путь:

1. Починить schema drift (BUG-A, BUG-B и всё, что вылезет по цепочке).
2. Дёрнуть `demo:seed` (или его HTTP-обёртку) — она соберёт Demo_Doom с ~150 сотрудниками, отделами, треками, менеджерами.
3. Стресс-тест Playwright'ом уже по готовой компании: логинимся Ивановой, гоняем HRD-дашборд, чаты, магазин, ищем баги в UI/API.

Отдельно параллельно чиним BUG-C (register_company через фронт) — это нужно для реальных внешних клиентов, но не блокирует стресс-тест.

## План

### Шаг 0 — Собрать оставшуюся диагностику (5 мин, только чтение)

Пришлите на проде:

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend

# a) Реальная ошибка register_company за последние 10 минут
grep -A20 "register_company\|rpc/register" storage/logs/laravel.log | tail -60

не выдала никакого ответа

# b) Все таблицы без updated_at или created_at (найти остальные жертвы)
php artisan tinker --execute='
$missing=[];
foreach (DB::select("SHOW TABLES") as $t) {
  $name = array_values((array)$t)[0];
  $cols = collect(DB::select("SHOW COLUMNS FROM `$name`"))->pluck("Field")->all();
  $lack = [];
  if (!in_array("updated_at",$cols)) $lack[]="updated_at";
  if (!in_array("created_at",$cols)) $lack[]="created_at";
  if ($lack) $missing[$name]=$lack;
}
print_r($missing);
'
[gro7659365@gro7659365 backend]$ grep -A20 "register_company\|rpc/register" storage/logs/laravel.log | tail -60
[gro7659365@gro7659365 backend]$ php artisan tinker --execute='
> $missing=[];
> foreach (DB::select("SHOW TABLES") as $t) {
>   $name = array_values((array)$t)[0];
>   $cols = collect(DB::select("SHOW COLUMNS FROM `$name`"))->pluck("Field")->all();
>   $lack = [];
>   if (!in_array("updated_at",$cols)) $lack[]="updated_at";
>   if (!in_array("created_at",$cols)) $lack[]="created_at";
>   if ($lack) $missing[$name]=$lack;
> }
> print_r($missing);
> '
Array
(
    [achievements] => Array
        (
            [0] => updated_at
        )

    [ai_usage_log] => Array
        (
            [0] => updated_at
        )

    [analytics_events] => Array
        (
            [0] => updated_at
            [1] => created_at
        )

    [assessments] => Array
        (
            [0] => updated_at
        )

    [cache] => Array
        (
            [0] => updated_at
            [1] => created_at
        )

    [cache_locks] => Array
        (
            [0] => updated_at
            [1] => created_at
        )

    [career_level_actions] => Array
        (
            [0] => updated_at
        )

    [career_step_submission_files] => Array
        (
            [0] => updated_at
            [1] => created_at
        )

    [chat_message_reactions] => Array
        (
            [0] => updated_at
        )

    [currency_balances] => Array
        (
            [0] => created_at
        )

    [currency_transactions] => Array
        (
            [0] => updated_at
        )

    [employee_career_assignments] => Array
        (
            [0] => created_at
        )

    [employee_questionnaire_files] => Array
        (
            [0] => updated_at
            [1] => created_at
        )

    [employee_rewards] => Array
        (
            [0] => updated_at
        )

    [employee_risk_scores] => Array
        (
            [0] => created_at
        )

    [failed_jobs] => Array
        (
            [0] => updated_at
            [1] => created_at
        )

    [goal_checklist_items] => Array
        (
            [0] => updated_at
        )

    [hr_task_assignees] => Array
        (
            [0] => updated_at
        )

    [impersonation_audit] => Array
        (
            [0] => updated_at
            [1] => created_at
        )

    [initiative_votes] => Array
        (
            [0] => updated_at
        )

    [job_batches] => Array
        (
            [0] => updated_at
        )

    [jobs] => Array
        (
            [0] => updated_at
        )

    [migrations] => Array
        (
            [0] => updated_at
            [1] => created_at
        )

    [model_has_permissions] => Array
        (
            [0] => updated_at
            [1] => created_at
        )

    [model_has_roles] => Array
        (
            [0] => updated_at
            [1] => created_at
        )

    [notifications] => Array
        (
            [0] => updated_at
        )

    [password_reset_tokens] => Array
        (
            [0] => updated_at
        )

    [peer_recognition_reactions] => Array
        (
            [0] => updated_at
        )

    [peer_recognitions] => Array
        (
            [0] => updated_at
        )

    [role_has_permissions] => Array
        (
            [0] => updated_at
            [1] => created_at
        )

    [sessions] => Array
        (
            [0] => updated_at
            [1] => created_at
        )

    [shop_order_items] => Array
        (
            [0] => updated_at
        )

    [team_members] => Array
        (
            [0] => updated_at
        )

    [test_attempts] => Array
        (
            [0] => updated_at
        )

    [tracker_audit_log] => Array
        (
            [0] => updated_at
        )

    [user_roles] => Array
        (
            [0] => updated_at
            [1] => created_at
        )

    [webhook_deliveries] => Array
        (
            [0] => updated_at
            [1] => created_at
        )

)

# c) Статус миграций
php artisan migrate:status 2>&1 | tail -40
[gro7659365@gro7659365 backend]$ php artisan migrate:status 2>&1 | tail -40
  0002_00_39_000000_create_shop_order_items_table .................... [5] Ran
  0002_00_40_000000_create_shop_orders_table ......................... [5] Ran
  0002_00_41_000000_create_shop_products_table ....................... [5] Ran
  0002_00_42_000000_create_support_tickets_table ..................... [5] Ran
  0002_00_43_000000_create_team_members_table ........................ [5] Ran
  0002_00_44_000000_create_test_attempts_table ....................... [5] Ran
  0002_00_45_000000_create_user_roles_table .......................... [5] Ran
  0002_99_99_000000_ensure_users_meta_columns ........................ [6] Ran
  0003_00_00_000000_seed_test_users .................................. [7] Ran
  0003_00_01_000000_reset_test_user_passwords ........................ [8] Ran
  0004_00_00_000000_create_email_settings_table ...................... [9] Ran
  0004_10_00_000000_create_password_reset_tokens_table .............. [12] Ran
  0004_20_00_000000_grant_zaslavv_superadmin ........................ [12] Ran
  0004_30_00_000000_normalize_yandex_email_settings ................. [13] Ran
  0005_00_00_000000_relax_impersonation_audit_user_ids .............. [10] Ran
  0006_00_00_000000_relax_sanctum_tokenable_id ...................... [11] Ran
  0007_00_00_000000_create_analytics_tables ......................... [14] Ran
  0008_00_00_000000_create_chat_tables .............................. [15] Ran
  0009_00_00_000000_add_is_support_to_profiles ...................... [16] Ran
  0010_00_00_000000_create_leaves_module_tables ..................... [17] Ran
  0011_00_00_000000_create_performance_module_tables ................ [18] Ran
  0012_00_00_000000_create_company_branding_table ................... [19] Ran
  0013_00_00_000000_create_ai_settings_table ........................ [20] Ran
  0014_00_00_000000_create_rag_documents_table ...................... [21] Ran
  0015_00_00_000000_create_university_tables ........................ [22] Ran
  0016_00_00_000000_create_tracker_module_tables .................... [23] Ran
  0017_00_00_000000_create_tracker_projects_and_extend_tasks ........ [24] Ran
  0018_00_00_000000_create_tracker_workflows ........................ [25] Ran
  0019_00_00_000000_create_tracker_sprints .......................... [26] Ran
  0020_00_00_000000_create_tracker_collaboration .................... [27] Ran
  0021_00_00_000000_create_gamification_levels_and_chat_sticker ..... [28] Ran
  0022_00_00_000000_add_product_automation_columns .................. [29] Ran
  0023_00_00_000000_create_onboarding_module_tables ................. [30] Ran
  0024_00_00_000000_create_ld_module_tables ......................... [31] Ran
  0025_00_00_000000_create_wave3_performance_extras ................. [32] Ran
  0026_00_00_000000_create_wave4_portal_tables ...................... [33] Ran
  0027_00_00_000000_create_wave5_core_hr_extras ..................... [34] Ran
  0028_00_00_000000_create_wave6_analytics_integrations ............. [35] Ran
  0029_00_00_000000_create_wave7_comfort_and_initiatives_tables ..... [36] Ran

```

От вывода (a) зависит, чинить BUG-C напрямую или сначала обойти через demo:seed. От (b) — сколько таблиц нужно ALTER'ить. От (c) — какие миграции застряли.

### Шаг 1 — Миграция schema drift (после Шага 0)

Написать **одну идемпотентную** миграцию, которая добавляет `updated_at`/`created_at` во все таблицы из списка (b), например:

```sql
ALTER TABLE team_members
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE employee_career_assignments
  ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;
-- + остальные по списку из Шага 0
```

Использую `Schema::hasColumn(...)` гарды, чтобы миграция не падала при повторных прогонах и на dev-БД где колонка уже есть. Файл: `backend-laravel/database/migrations/0022_00_00_000000_fix_missing_timestamps.php`.

### Шаг 2 — Выкатить миграцию на прод (делаете вы, 1 команда)

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
git pull
php artisan migrate --force
php artisan config:clear && php artisan route:clear
```

### Шаг 3 — Запустить demo:seed для Demo_Doom

Два способа, выберите удобнее:

- **CLI** (быстрее): `php artisan demo:seed --name="Demo_Doom" --hrd-email=growthpeak@yandex.ru` (проверю сигнатуру команды).
- **HTTP** (как обычный superadmin): логинюсь Playwright'ом под вашим superadmin-логином (нужен от вас), иду в `/superadmin/demo-seed`, жму кнопку.

Что произойдёт: создастся компания «Demo_Doom», Иванова Евгения Борисовна (или дефолтный HRD, если параметр не поддерживается), N сотрудников с должностями/отделами/треками/менеджерами. Если по ходу вылезут новые schema-баги — соберу их пакетом в отчёт и залатаю второй миграцией.

### Шаг 4 — Стресс-тест по готовой компании

Playwright под Ивановой (либо superadmin с impersonate → Иванова) проходит по всем HRD-модулям: дашборд, оргструктура, treas/tracks, chats, магазин, аналитика рисков, комфорта, initiatives. Каждый 5xx / странный 4xx / зависший UI / долгий запрос → в `/tmp/stress/report.md` с скриншотом и network-дампом.

### Шаг 5 — Отдельно BUG-C (регистрация через фронт)

По логу из Шага 0(a) станет ясно, там schema drift того же типа (внутри native `register_company`), или Postgres-синтаксис в `RpcController` действительно доходит до MySQL. Если schema drift — уже починен Шагом 1. Если синтаксис — отдельный PR: переписать `register_company` в native PHP (как уже сделано для `verify_user` и `assign_role`), чтобы не зависеть от Postgres-функций. Это ~30 строк в `RpcController`.

## Что мне нужно от вас сейчас

1. Вывод трёх команд из Шага 0.
2. Ответ: у вас есть superadmin-логин для growth-peak.pro, который я могу использовать для HTTP-запуска demo:seed и последующей импёрсонации в стресс-тесте? Если да — киньте email/пароль (буду использовать один раз, потом никуда не логирую).
3. Готовность выкатить миграцию на прод (Шаг 2 — команда `php artisan migrate --force`, откатывается через `migrate:rollback`).

После этого я в build-mode накатаю миграцию, вы её задеплоите, и погнали дальше.