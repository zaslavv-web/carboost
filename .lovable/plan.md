## Проблема

`mysql` без явных кредов не находит пароль. Пароль лежит в `.env` (`DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_HOST`). Нужно либо передавать их в mysql, либо гонять запросы через artisan tinker.

## Вариант A — mysql с паролем из .env (одна строка)

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
set -a; source <(grep -E '^DB_(HOST|PORT|DATABASE|USERNAME|PASSWORD)=' .env | sed 's/^/export /'); set +a
alias mysqldb='mysql -h"$DB_HOST" -P"${DB_PORT:-3306}" -u"$DB_USERNAME" -p"$DB_PASSWORD" "$DB_DATABASE"'

EMAIL="ivan.ivanov@aiguild.demo"   # подставьте реальный email, который вы пытались пригласить

# 1) Найти запись во всех таблицах, где есть колонка *email*/*mail*
mysqldb -N -e "
  SELECT CONCAT('SELECT ''', table_name, ''' AS tbl, COUNT(*) AS n FROM \`', table_name, '\` WHERE \`', column_name, '\` = ''${EMAIL}'' UNION ALL')
  FROM information_schema.columns
  WHERE table_schema='${DB_DATABASE}'
    AND (column_name LIKE '%email%' OR column_name LIKE '%mail%');
" | sed '$ s/UNION ALL$/;/' > /tmp/scan.sql
mysqldb < /tmp/scan.sql
```

## Вариант B — точечные запросы

```bash
mysqldb -e "
  SELECT 'users' t, id, email, created_at FROM users WHERE email='${EMAIL}'
  UNION ALL SELECT 'profiles', CAST(user_id AS CHAR), email, updated_at FROM profiles WHERE email='${EMAIL}'
  UNION ALL SELECT 'employee_invitations', CAST(id AS CHAR), email, status FROM employee_invitations WHERE email='${EMAIL}';
"

# Схема таблицы приглашений
mysqldb -e "SHOW CREATE TABLE employee_invitations\G"
mysqldb -e "SHOW INDEX FROM employee_invitations;"
```

## Вариант C — без mysql, через Laravel

```bash
php artisan tinker --execute="
  \$e='${EMAIL}';
  print_r([
    'users'  => DB::table('users')->where('email',\$e)->count(),
    'profiles' => DB::table('profiles')->where('email',\$e)->count(),
    'invites' => DB::table('employee_invitations')->where('email',\$e)->get(['id','company_id','status','created_at'])->toArray(),
  ]);
"

ответ:
```

[gro7659365@gro7659365 backend]$ mysql "$DB" -e "SHOW CREATE TABLE employee_invitations\G"

ERROR 1045 (28000): Access denied for user 'gro7659365'@'localhost' (using password: NO)

[gro7659365@gro7659365 backend]$ mysql "$DB" -e "SHOW INDEX FROM employee_invitations;"

ERROR 1045 (28000): Access denied for user 'gro7659365'@'localhost' (using password: NO)

[gro7659365@gro7659365 backend]$ mysql "$DB" -e "

>   SELECT status, COUNT(*) FROM employee_invitations

>   WHERE email='${EMAIL}' GROUP BY status;

> "

ERROR 1045 (28000): Access denied for user 'gro7659365'@'localhost' (using password: NO)

[gro7659365@gro7659365 backend]$ php artisan tinker --execute="

>   \$e='${EMAIL}';

>   print_r([

>     'users'  => DB::table('users')->where('email',\$e)->count(),

>     'profiles' => DB::table('profiles')->where('email',\$e)->count(),

>     'invites' => DB::table('employee_invitations')->where('email',\$e)->get(['id','company_id','status','created_at'])->toArray(),

>   ]);

> "

   Illuminate\Database\QueryException  SQLSTATE[42S22]: Column not found: 1054 Unknown column 'email' in 'where clause' (Connection: mysql, SQL: select count(*) as aggregate from `profiles` where `email` = [test@example.com](mailto:test@example.com)).

&nbsp;

## Что мне нужно от вас

1. Реальный email, который вы пытались пригласить (я тестировал шаблон `ivan.ivanov@aiguild.demo`).  
muxtar2005@gmail.com
2. Ответ команды B (три `UNION ALL` + `SHOW CREATE TABLE employee_invitations`).
3. Ответ POST `/api/rpc/bulk_invite_employees` из DevTools → Network → вкладка Response при следующей попытке.

По этим данным определю, какая из 10 гипотез (уникальный индекс, NOT NULL, кэш, залипшие pending и т.д.) сработала, и выкачу точечный фикс.