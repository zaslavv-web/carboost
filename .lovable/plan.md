# Таймауты у обычных пользователей (superadmin работает)

## Что подтверждено в коде

Асимметрия «superadmin ок / остальные висят» объясняется тем, сколько запросов к MySQL делает один HTTP-запрос.

`CompanyScope::apply()` выполняется для **каждого** обращения к любой модели:

```text
superadmin:  hasRole('superadmin') -> 1 SELECT user_roles -> return (scope не применяется)
обычный:     hasRole('superadmin') -> 1 SELECT user_roles
             hasRole у impersonator (если есть) -> ещё SELECT
             companyId() -> SHOW COLUMNS FROM profiles LIKE 'user_id'
                         -> SELECT company_id FROM profiles
```

Подтверждённые места:
- `backend-laravel/app/Models/Scopes/CompanyScope.php:26-42` — вызовы `hasRole()` и `companyId()` на каждый запрос модели, без кэша.
- `backend-laravel/app/Models/User.php:110-167` — `hasRole()` каждый раз читает `user_roles`; `companyId()` и `isVerified()` каждый раз делают `SHOW COLUMNS` + `SELECT` из `profiles`. Результат нигде не мемоизируется.
- Политики (`app/Policies/*`) вызывают те же `hasRole()`/`companyId()` многократно на запрос.

Итого: страница обычного пользователя с 8 логическими запросами превращается в десятки коротких запросов, каждый из которых удерживает соединение дольше; на шаред-хостинге с `max_user_connections` это и даёт таймауты. У superadmin этот множитель отсутствует полностью — именно поэтому у него всё штатно.

Дополнительный усилитель на стороне созданного через приглашение пользователя: если строки профиля нет, `/profiles/me` уходит в самовосстановление `AuthUserService::repairDomainRowsForLogin()`, которое перебирает схему через `SHOW COLUMNS` и пишет строки — и это повторяется на каждом заходе, пока строки не станут консистентными.

## Что делать

### 1. Мемоизация прав в пределах запроса

В `User` кэшировать в свойствах объекта на время запроса:
- список ролей из `user_roles` (один SELECT на запрос вместо N);
- `companyId()` и `isVerified()` (один SELECT вместо N);
- результат `canCompareColumnValue()` — кэшировать метаданные колонок статически, чтобы `SHOW COLUMNS` выполнялся максимум один раз за процесс.

Метаданные схемы дополнительно положить в `Cache` на несколько минут: они меняются только при миграциях.

### 2. Убрать повторную работу в CompanyScope

Считать роли/`company_id` один раз за запрос и переиспользовать в scope и во всех политиках. Поведение прав не меняется: superadmin по-прежнему без ограничений, отсутствие `company_id` по-прежнему даёт пустую выборку.

### 3. Прекратить повторное самовосстановление

В `/profiles/me` выполнять `repairDomainRowsForLogin()` не чаще одного раза за короткий интервал на пользователя (короткая блокировка в кэше) и логировать, если после починки строка всё ещё не появилась — тогда это данные, а не гонка. Проверить конкретно учётку `kafedina@postgroup.ru`: есть ли строка в `profiles`, привязана ли она к тому же `user_id`, что и токен, и заполнен ли `company_id`.

### 4. Замер до/после

- Включить временный лог количества SQL-запросов на HTTP-запрос (`DB::listen`) для `/api/profiles/me`, `/api/chats`, `/api/db/*`.
- Снять цифры под superadmin и под обычным пользователем — ожидается сокращение с десятков до единиц.
- Повторить вход `kafedina@postgroup.ru`: страница должна открываться без таймаута.

### 5. Побочно: 400 на уведомлениях

`GET /api/db/notifications?...` отвечает `invalid_query` — запрос падает в `QueryException` внутри `DbController`. Разобрать по логу `DbController query failed` (там пишется реальный SQL) и починить фильтр; сейчас индикатор непрочитанных всегда показывает 0 и создаёт лишний запрос каждую минуту.

## Технические точки изменения

- `backend-laravel/app/Models/User.php` — мемоизация ролей, `companyId`, `isVerified`, кэш метаданных колонок.
- `backend-laravel/app/Models/Scopes/CompanyScope.php` — использование мемоизированных значений.
- `backend-laravel/app/Http/Controllers/Api/ProfileController.php` — ограничение частоты самовосстановления.
- `backend-laravel/app/Services/AuthUserService.php` — вынести проверки схемы на кэш.
- Диагностика: временный `DB::listen` в `AppServiceProvider` под флагом окружения.
