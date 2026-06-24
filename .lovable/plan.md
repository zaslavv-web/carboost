## Проблема

При создании OKR фронт получает `"message": "Server Error"` — это generic 500-ответ Laravel. В отличие от 403 («Недостаточно прав») и 422, у 500 в ответе нет деталей, и причина видна только в `storage/logs/laravel.log` на сервере.

## Гипотезы (по убыванию вероятности)

1. **NOT NULL на `holder_id` или `author_id`.** В миграции оба обязательны. `author_id` подставляется из `auth()->user()->id` в `TrackerGoal::booted()`, `holder_id` — с фронта из `useEffectiveUserId()`. Если на сервере для текущего пользователя по какой-то причине `uid` пришёл `null`, БД ругнётся.
2. **Foreign key / тип uuid.** `holder_id` сейчас без FK, но если значение не uuid — Postgres вернёт `invalid input syntax for uuid`.
3. **Listener `TrackerAuditLog::create` падает на нехватке полей.** Срабатывает только на `updated`, не на `creating` — на создании не должно мешать, но проверим.
4. `**BelongsToCompany` не подставил `company_id`,** если у пользователя `companyId()` вернул `null` (например, суперадмин без выбранной компании в impersonation).

## Что нужно от вас (1 минута)

На сервере:

```bash
cd backend-laravel
tail -n 80 storage/logs/laravel.log
[gro7659365@gro7659365 backend]$ tail -n 80 storage/logs/laravel.log
#30 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Middleware/TransformsRequest.php(21): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#31 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Middleware/ConvertEmptyStringsToNull.php(31): Illuminate\\Foundation\\Http\\Middleware\\TransformsRequest->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#32 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Foundation\\Http\\Middleware\\ConvertEmptyStringsToNull->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#33 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Middleware/TransformsRequest.php(21): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#34 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Middleware/TrimStrings.php(51): Illuminate\\Foundation\\Http\\Middleware\\TransformsRequest->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#35 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Foundation\\Http\\Middleware\\TrimStrings->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#36 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Http/Middleware/ValidatePostSize.php(27): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#37 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Http\\Middleware\\ValidatePostSize->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#38 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Middleware/PreventRequestsDuringMaintenance.php(110): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#39 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Foundation\\Http\\Middleware\\PreventRequestsDuringMaintenance->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#40 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Http/Middleware/HandleCors.php(62): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#41 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Http\\Middleware\\HandleCors->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#42 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Http/Middleware/TrustProxies.php(58): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#43 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Http\\Middleware\\TrustProxies->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#44 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Middleware/InvokeDeferredCallbacks.php(22): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#45 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Foundation\\Http\\Middleware\\InvokeDeferredCallbacks->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#46 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(127): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#47 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Kernel.php(176): Illuminate\\Pipeline\\Pipeline->then(Object(Closure))
#48 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Kernel.php(145): Illuminate\\Foundation\\Http\\Kernel->sendRequestThroughRouter(Object(Illuminate\\Http\\Request))
#49 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Application.php(1220): Illuminate\\Foundation\\Http\\Kernel->handle(Object(Illuminate\\Http\\Request))
#50 /home/gro7659365/growth-peak.pro/docs/backend/public/index.php(17): Illuminate\\Foundation\\Application->handleRequest(Object(Illuminate\\Http\\Request))
#51 {main}

[previous exception] [object] (PDOException(code: HY000): SQLSTATE[HY000]: General error: 1364 Field 'company_id' doesn't have a default value at /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/MySqlConnection.php:53)
[stacktrace]
#0 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/MySqlConnection.php(53): PDOStatement->execute()
#1 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(812): Illuminate\\Database\\MySqlConnection->Illuminate\\Database\\{closure}('insert into `tr...', Array)
#2 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(779): Illuminate\\Database\\Connection->runQueryCallback('insert into `tr...', Array, Object(Closure))
#3 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/MySqlConnection.php(42): Illuminate\\Database\\Connection->run('insert into `tr...', Array, Object(Closure))
#4 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3717): Illuminate\\Database\\MySqlConnection->insert('insert into `tr...', Array)
#5 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(2120): Illuminate\\Database\\Query\\Builder->insert(Array)
#6 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(1335): Illuminate\\Database\\Eloquent\\Builder->__call('insert', Array)
#7 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(1163): Illuminate\\Database\\Eloquent\\Model->performInsert(Object(Illuminate\\Database\\Eloquent\\Builder))
#8 /home/gro7659365/growth-peak.pro/docs/backend/app/Http/Controllers/Api/DbController.php(150): Illuminate\\Database\\Eloquent\\Model->save()
#9 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Controller.php(54): App\\Http\\Controllers\\Api\\DbController->store(Object(Illuminate\\Http\\Request), 'tracker_goals')
#10 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/ControllerDispatcher.php(44): Illuminate\\Routing\\Controller->callAction('store', Array)
#11 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Route.php(266): Illuminate\\Routing\\ControllerDispatcher->dispatch(Object(Illuminate\\Routing\\Route), Object(App\\Http\\Controllers\\Api\\DbController), 'store')
#12 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Route.php(212): Illuminate\\Routing\\Route->runController()
#13 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Router.php(808): Illuminate\\Routing\\Route->run()
#14 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(170): Illuminate\\Routing\\Router->Illuminate\\Routing\\{closure}(Object(Illuminate\\Http\\Request))
#15 /home/gro7659365/growth-peak.pro/docs/backend/app/Http/Middleware/EnsureHasCompany.php(27): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#16 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): App\\Http\\Middleware\\EnsureHasCompany->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#17 /home/gro7659365/growth-peak.pro/docs/backend/app/Http/Middleware/EnsureVerified.php(32): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#18 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): App\\Http\\Middleware\\EnsureVerified->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#19 /home/gro7659365/growth-peak.pro/docs/backend/app/Http/Middleware/EffectiveUser.php(33): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#20 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): App\\Http\\Middleware\\EffectiveUser->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#21 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Middleware/SubstituteBindings.php(51): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#22 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Routing\\Middleware\\SubstituteBindings->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#23 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Auth/Middleware/Authenticate.php(64): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#24 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Auth\\Middleware\\Authenticate->handle(Object(Illuminate\\Http\\Request), Object(Closure), 'sanctum')
#25 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(127): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#26 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Router.php(807): Illuminate\\Pipeline\\Pipeline->then(Object(Closure))
#27 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Router.php(786): Illuminate\\Routing\\Router->runRouteWithinStack(Object(Illuminate\\Routing\\Route), Object(Illuminate\\Http\\Request))
#28 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Router.php(750): Illuminate\\Routing\\Router->runRoute(Object(Illuminate\\Http\\Request), Object(Illuminate\\Routing\\Route))
#29 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Router.php(739): Illuminate\\Routing\\Router->dispatchToRoute(Object(Illuminate\\Http\\Request))
#30 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Kernel.php(201): Illuminate\\Routing\\Router->dispatch(Object(Illuminate\\Http\\Request))
#31 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(170): Illuminate\\Foundation\\Http\\Kernel->Illuminate\\Foundation\\Http\\{closure}(Object(Illuminate\\Http\\Request))
#32 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Middleware/TransformsRequest.php(21): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#33 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Middleware/ConvertEmptyStringsToNull.php(31): Illuminate\\Foundation\\Http\\Middleware\\TransformsRequest->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#34 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Foundation\\Http\\Middleware\\ConvertEmptyStringsToNull->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#35 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Middleware/TransformsRequest.php(21): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#36 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Middleware/TrimStrings.php(51): Illuminate\\Foundation\\Http\\Middleware\\TransformsRequest->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#37 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Foundation\\Http\\Middleware\\TrimStrings->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#38 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Http/Middleware/ValidatePostSize.php(27): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#39 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Http\\Middleware\\ValidatePostSize->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#40 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Middleware/PreventRequestsDuringMaintenance.php(110): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#41 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Foundation\\Http\\Middleware\\PreventRequestsDuringMaintenance->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#42 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Http/Middleware/HandleCors.php(62): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#43 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Http\\Middleware\\HandleCors->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#44 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Http/Middleware/TrustProxies.php(58): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#45 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Http\\Middleware\\TrustProxies->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#46 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Middleware/InvokeDeferredCallbacks.php(22): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#47 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(209): Illuminate\\Foundation\\Http\\Middleware\\InvokeDeferredCallbacks->handle(Object(Illuminate\\Http\\Request), Object(Closure))
#48 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(127): Illuminate\\Pipeline\\Pipeline->Illuminate\\Pipeline\\{closure}(Object(Illuminate\\Http\\Request))
#49 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Kernel.php(176): Illuminate\\Pipeline\\Pipeline->then(Object(Closure))
#50 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Http/Kernel.php(145): Illuminate\\Foundation\\Http\\Kernel->sendRequestThroughRouter(Object(Illuminate\\Http\\Request))
#51 /home/gro7659365/growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Foundation/Application.php(1220): Illuminate\\Foundation\\Http\\Kernel->handle(Object(Illuminate\\Http\\Request))
#52 /home/gro7659365/growth-peak.pro/docs/backend/public/index.php(17): Illuminate\\Foundation\\Application->handleRequest(Object(Illuminate\\Http\\Request))
#53 {main}
"}

```

&nbsp;

Пришлите последние ~30 строк после попытки создания OKR — там будет конкретный SQL/исключение. С ним фикс однозначный.

## Что делаю параллельно в build-режиме

Чтобы такие случаи в будущем не были «слепыми», добавлю **минимальную диагностическую обвязку** без изменения логики:

1. В `DbController::store()` оберну `$instance->save()` в try/catch:
  - `QueryException` → возвращаю 422 с короткой человекочитаемой причиной (`SQLSTATE` + первая строка сообщения), без стектрейса.
  - Прочие `\Throwable` → 500, но с `error.code = exception_class` и `error.message`, плюс `Log::error()` с контекстом (table, payload без секретов, user_id).
2. В `useCreateGoal` (фронт) добавлю явную проверку `if (!uid) throw new Error('Не определён пользователь-владелец')` до запроса — это уберёт сценарий №1 как «молчаливый».
3. В тосте `toast.error` для мутаций OKR покажу `error.message` целиком (сейчас, вероятно, схлопывается до «Server Error»).

После этого либо ошибка станет понятной сама собой, либо в логе всплывёт нужный SQL — и я допишу профильный фикс (FK, дефолт, fallback на `auth()->id()` и т.п.).

## Чего НЕ меняю

- Миграцию `0016_...` не правлю — таблицы уже созданы, изменения схемы потребуют новой миграции.
- Логику ролей/политик не трогаю — судя по тексту ошибки, это не 403.

После вашего вывода `laravel.log` сделаю точечный фикс в одном файле.