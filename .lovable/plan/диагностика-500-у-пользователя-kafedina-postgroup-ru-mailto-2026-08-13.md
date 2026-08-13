# Диагностика 500 у пользователя [kafedina@postgroup.ru](mailto:kafedina@postgroup.ru)

## Что уже точно известно (проверено сейчас)

- `/api/health` отвечает `{"status":"ok","db":"ok","memory_limit":"256M"}` — память поднята, БД доступна, бэкенд жив.
- Падают конкретные эндпоинты, а не сервер целиком:
  - `GET /api/leave-requests?scope=inbox&status=pending_hr` → 500
  - `GET /api/db/notifications?select=id&count=exact&head=1&eq.user_id=1259&eq.is_read=false` → 500
- В URL уведомлений `user_id=1259` — числовой идентификатор, тогда как модели в репозитории объявлены с UUID-ключами (`HasUuids`). Это расхождение нужно проверить по факту, а не считать причиной заранее.

Причина 500 пока **не подтверждена**. Прошлые правки били по памяти — она вылечена, значит здесь другая ошибка. Первый шаг плана — получить точный текст исключения, а не гадать.

## Шаг 1. Снять точную ошибку с сервера

На сервере, сразу после воспроизведения (зайти под kafedina и обновить стартовую ЛК):

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
tail -n 400 storage/logs/laravel.log | grep -n -A 25 -E "leave-requests|db/notifications|SQLSTATE|Exception"
```

Нужны первые 15–25 строк стектрейса каждого из двух исключений — там будет класс ошибки, SQL и файл.  
  


[gro7659365@gro7659365 backend]$ tail -n 400 storage/logs/laravel.log | grep -n -A 25 -E "leave-requests|db/notifications|SQLSTATE|Exception"

43:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

44-[stacktrace]

45-#0 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php(66)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php(66)): PDO->__construct('mysql:host=gro7...', 'gro7659365_grow', Object(SensitiveParameterValue), Array)

46-#1 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php(44)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php(44)): Illuminate\\Database\\Connectors\\Connector->createPdoConnection('mysql:host=gro7...', 'gro7659365_grow', Object(SensitiveParameterValue), Array)

47-#2 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/MySqlConnector.php(24)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/MySqlConnector.php(24)): Illuminate\\Database\\Connectors\\Connector->createConnection('mysql:host=gro7...', Array, Array)

48-#3 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/ConnectionFactory.php(185)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/ConnectionFactory.php(185)): Illuminate\\Database\\Connectors\\MySqlConnector->connect(Array)

49-#4 [internal function]: Illuminate\\Database\\Connectors\\ConnectionFactory->Illuminate\\Database\\Connectors\\{closure}()

50-#5 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(1231)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(1231)): call_user_func(Object(Closure))

51-#6 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(1267)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(1267)): Illuminate\\Database\\Connection->getPdo()

52-#7 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(512)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(512)): Illuminate\\Database\\Connection->getReadPdo()

53-#8 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(407)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(407)): Illuminate\\Database\\Connection->getPdoForSelect(true)

54-#9 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(812)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(812)): Illuminate\\Database\\Connection->Illuminate\\Database\\{closure}('select * from `...', Array)

55-#10 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(779)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(779)): Illuminate\\Database\\Connection->runQueryCallback('select * from `...', Array, Object(Closure))

56-#11 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(398)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(398)): Illuminate\\Database\\Connection->run('select * from `...', Array, Object(Closure))

57-#12 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3106)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3106)): Illuminate\\Database\\Connection->select('select * from `...', Array, true)

58-#13 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3091)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3091)): Illuminate\\Database\\Query\\Builder->runSelect()

59-#14 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3676)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3676)): Illuminate\\Database\\Query\\Builder->Illuminate\\Database\\Query\\{closure}()

60-#15 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3090)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3090)): Illuminate\\Database\\Query\\Builder->onceWithColumns(Array, Object(Closure))

61-#16 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(811)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(811)): Illuminate\\Database\\Query\\Builder->get(Array)

62-#17 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(793)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(793)): Illuminate\\Database\\Eloquent\\Builder->getModels(Array)

63-#18 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Concerns/BuildsQueries.php(343)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Concerns/BuildsQueries.php(343)): Illuminate\\Database\\Eloquent\\Builder->get(Array)

64-#19 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(477)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(477)): Illuminate\\Database\\Eloquent\\Builder->first(Array)

65-#20 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Support/Traits/ForwardsCalls.php(23)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Support/Traits/ForwardsCalls.php(23)): Illuminate\\Database\\Eloquent\\Builder->find('189')

66-#21 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2372)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2372)): Illuminate\\Database\\Eloquent\\Model->forwardCallTo(Object(Illuminate\\Database\\Eloquent\\Builder), 'find', Array)

67-#22 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2384)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2384)): Illuminate\\Database\\Eloquent\\Model->__call('find', Array)

68-#23 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/sanctum/src/PersonalAccessToken.php(66)](http://growth-peak.pro/docs/backend/vendor/laravel/sanctum/src/PersonalAccessToken.php(66)): Illuminate\\Database\\Eloquent\\Model::__callStatic('find', Array)

--

108:[2026-08-13 10:51:06] production.ERROR: SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) {"exception":"[object] (Illuminate\\Database\\QueryException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825))

109-[stacktrace]

110-#0 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(779)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(779)): Illuminate\\Database\\Connection->runQueryCallback('select * from `...', Array, Object(Closure))

111-#1 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(398)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(398)): Illuminate\\Database\\Connection->run('select * from `...', Array, Object(Closure))

112-#2 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3106)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3106)): Illuminate\\Database\\Connection->select('select * from `...', Array, true)

113-#3 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3091)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3091)): Illuminate\\Database\\Query\\Builder->runSelect()

114-#4 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3676)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3676)): Illuminate\\Database\\Query\\Builder->Illuminate\\Database\\Query\\{closure}()

115-#5 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3090)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3090)): Illuminate\\Database\\Query\\Builder->onceWithColumns(Array, Object(Closure))

116-#6 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(811)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(811)): Illuminate\\Database\\Query\\Builder->get(Array)

117-#7 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(793)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(793)): Illuminate\\Database\\Eloquent\\Builder->getModels(Array)

118-#8 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Concerns/BuildsQueries.php(343)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Concerns/BuildsQueries.php(343)): Illuminate\\Database\\Eloquent\\Builder->get(Array)

119-#9 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(477)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(477)): Illuminate\\Database\\Eloquent\\Builder->first(Array)

120-#10 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Support/Traits/ForwardsCalls.php(23)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Support/Traits/ForwardsCalls.php(23)): Illuminate\\Database\\Eloquent\\Builder->find('189')

121-#11 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2372)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2372)): Illuminate\\Database\\Eloquent\\Model->forwardCallTo(Object(Illuminate\\Database\\Eloquent\\Builder), 'find', Array)

122-#12 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2384)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2384)): Illuminate\\Database\\Eloquent\\Model->__call('find', Array)

123-#13 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/sanctum/src/PersonalAccessToken.php(66)](http://growth-peak.pro/docs/backend/vendor/laravel/sanctum/src/PersonalAccessToken.php(66)): Illuminate\\Database\\Eloquent\\Model::__callStatic('find', Array)

124-#14 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/sanctum/src/Guard.php(43)](http://growth-peak.pro/docs/backend/vendor/laravel/sanctum/src/Guard.php(43)): Laravel\\Sanctum\\PersonalAccessToken::findToken('OchMggzD0QUJIub...')

125-#15 [internal function]: Laravel\\Sanctum\\Guard->__invoke(Object(Illuminate\\Http\\Request), NULL)

126-#16 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Auth/RequestGuard.php(57)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Auth/RequestGuard.php(57)): call_user_func(Object(Laravel\\Sanctum\\Guard), Object(Illuminate\\Http\\Request), NULL)

127-#17 /home/gro7659365/[growth-peak.pro/docs/backend/app/Http/Controllers/Api/AnalyticsController.php(51)](http://growth-peak.pro/docs/backend/app/Http/Controllers/Api/AnalyticsController.php(51)): Illuminate\\Auth\\RequestGuard->user()

128-#18 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Controller.php(54)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Controller.php(54)): App\\Http\\Controllers\\Api\\AnalyticsController->ingest(Object(Illuminate\\Http\\Request))

129-#19 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/ControllerDispatcher.php(44)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/ControllerDispatcher.php(44)): Illuminate\\Routing\\Controller->callAction('ingest', Array)

130-#20 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Route.php(266)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Route.php(266)): Illuminate\\Routing\\ControllerDispatcher->dispatch(Object(Illuminate\\Routing\\Route), Object(App\\Http\\Controllers\\Api\\AnalyticsController), 'ingest')

131-#21 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Route.php(212)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Route.php(212)): Illuminate\\Routing\\Route->runController()

132-#22 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Router.php(808)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Router.php(808)): Illuminate\\Routing\\Route->run()

133-#23 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(170)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(170)): Illuminate\\Routing\\Router->Illuminate\\Routing\\{closure}(Object(Illuminate\\Http\\Request))

--

171:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

172-[stacktrace]

173-#0 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php(66)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php(66)): PDO->__construct('mysql:host=gro7...', 'gro7659365_grow', Object(SensitiveParameterValue), Array)

174-#1 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php(44)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php(44)): Illuminate\\Database\\Connectors\\Connector->createPdoConnection('mysql:host=gro7...', 'gro7659365_grow', Object(SensitiveParameterValue), Array)

175-#2 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/MySqlConnector.php(24)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/MySqlConnector.php(24)): Illuminate\\Database\\Connectors\\Connector->createConnection('mysql:host=gro7...', Array, Array)

176-#3 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/ConnectionFactory.php(185)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/ConnectionFactory.php(185)): Illuminate\\Database\\Connectors\\MySqlConnector->connect(Array)

177-#4 [internal function]: Illuminate\\Database\\Connectors\\ConnectionFactory->Illuminate\\Database\\Connectors\\{closure}()

178-#5 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(1231)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(1231)): call_user_func(Object(Closure))

179-#6 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(1267)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(1267)): Illuminate\\Database\\Connection->getPdo()

180-#7 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(512)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(512)): Illuminate\\Database\\Connection->getReadPdo()

181-#8 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(407)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(407)): Illuminate\\Database\\Connection->getPdoForSelect(true)

182-#9 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(812)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(812)): Illuminate\\Database\\Connection->Illuminate\\Database\\{closure}('select * from `...', Array)

183-#10 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(779)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(779)): Illuminate\\Database\\Connection->runQueryCallback('select * from `...', Array, Object(Closure))

184-#11 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(398)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(398)): Illuminate\\Database\\Connection->run('select * from `...', Array, Object(Closure))

185-#12 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3106)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3106)): Illuminate\\Database\\Connection->select('select * from `...', Array, true)

186-#13 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3091)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3091)): Illuminate\\Database\\Query\\Builder->runSelect()

187-#14 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3676)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3676)): Illuminate\\Database\\Query\\Builder->Illuminate\\Database\\Query\\{closure}()

188-#15 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3090)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3090)): Illuminate\\Database\\Query\\Builder->onceWithColumns(Array, Object(Closure))

189-#16 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(811)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(811)): Illuminate\\Database\\Query\\Builder->get(Array)

190-#17 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(793)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(793)): Illuminate\\Database\\Eloquent\\Builder->getModels(Array)

191-#18 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Concerns/BuildsQueries.php(343)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Concerns/BuildsQueries.php(343)): Illuminate\\Database\\Eloquent\\Builder->get(Array)

192-#19 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(477)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(477)): Illuminate\\Database\\Eloquent\\Builder->first(Array)

193-#20 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Support/Traits/ForwardsCalls.php(23)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Support/Traits/ForwardsCalls.php(23)): Illuminate\\Database\\Eloquent\\Builder->find('189')

194-#21 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2372)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2372)): Illuminate\\Database\\Eloquent\\Model->forwardCallTo(Object(Illuminate\\Database\\Eloquent\\Builder), 'find', Array)

195-#22 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2384)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2384)): Illuminate\\Database\\Eloquent\\Model->__call('find', Array)

196-#23 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/sanctum/src/PersonalAccessToken.php(66)](http://growth-peak.pro/docs/backend/vendor/laravel/sanctum/src/PersonalAccessToken.php(66)): Illuminate\\Database\\Eloquent\\Model::__callStatic('find', Array)

--

244:[2026-08-13 10:51:11] production.ERROR: SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) {"exception":"[object] (Illuminate\\Database\\QueryException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825))

245-[stacktrace]

246-#0 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(779)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(779)): Illuminate\\Database\\Connection->runQueryCallback('select * from `...', Array, Object(Closure))

247-#1 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(398)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(398)): Illuminate\\Database\\Connection->run('select * from `...', Array, Object(Closure))

248-#2 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3106)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3106)): Illuminate\\Database\\Connection->select('select * from `...', Array, true)

249-#3 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3091)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3091)): Illuminate\\Database\\Query\\Builder->runSelect()

250-#4 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3676)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3676)): Illuminate\\Database\\Query\\Builder->Illuminate\\Database\\Query\\{closure}()

251-#5 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3090)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3090)): Illuminate\\Database\\Query\\Builder->onceWithColumns(Array, Object(Closure))

252-#6 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(811)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(811)): Illuminate\\Database\\Query\\Builder->get(Array)

253-#7 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(793)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(793)): Illuminate\\Database\\Eloquent\\Builder->getModels(Array)

254-#8 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Concerns/BuildsQueries.php(343)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Concerns/BuildsQueries.php(343)): Illuminate\\Database\\Eloquent\\Builder->get(Array)

255-#9 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(477)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(477)): Illuminate\\Database\\Eloquent\\Builder->first(Array)

256-#10 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Support/Traits/ForwardsCalls.php(23)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Support/Traits/ForwardsCalls.php(23)): Illuminate\\Database\\Eloquent\\Builder->find('189')

257-#11 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2372)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2372)): Illuminate\\Database\\Eloquent\\Model->forwardCallTo(Object(Illuminate\\Database\\Eloquent\\Builder), 'find', Array)

258-#12 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2384)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2384)): Illuminate\\Database\\Eloquent\\Model->__call('find', Array)

259-#13 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/sanctum/src/PersonalAccessToken.php(66)](http://growth-peak.pro/docs/backend/vendor/laravel/sanctum/src/PersonalAccessToken.php(66)): Illuminate\\Database\\Eloquent\\Model::__callStatic('find', Array)

260-#14 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/sanctum/src/Guard.php(43)](http://growth-peak.pro/docs/backend/vendor/laravel/sanctum/src/Guard.php(43)): Laravel\\Sanctum\\PersonalAccessToken::findToken('OchMggzD0QUJIub...')

261-#15 [internal function]: Laravel\\Sanctum\\Guard->__invoke(Object(Illuminate\\Http\\Request), NULL)

262-#16 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Auth/RequestGuard.php(57)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Auth/RequestGuard.php(57)): call_user_func(Object(Laravel\\Sanctum\\Guard), Object(Illuminate\\Http\\Request), NULL)

263-#17 /home/gro7659365/[growth-peak.pro/docs/backend/app/Http/Controllers/Api/AnalyticsController.php(51)](http://growth-peak.pro/docs/backend/app/Http/Controllers/Api/AnalyticsController.php(51)): Illuminate\\Auth\\RequestGuard->user()

264-#18 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Controller.php(54)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Controller.php(54)): App\\Http\\Controllers\\Api\\AnalyticsController->ingest(Object(Illuminate\\Http\\Request))

265-#19 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/ControllerDispatcher.php(44)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/ControllerDispatcher.php(44)): Illuminate\\Routing\\Controller->callAction('ingest', Array)

266-#20 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Route.php(266)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Route.php(266)): Illuminate\\Routing\\ControllerDispatcher->dispatch(Object(Illuminate\\Routing\\Route), Object(App\\Http\\Controllers\\Api\\AnalyticsController), 'ingest')

267-#21 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Route.php(212)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Route.php(212)): Illuminate\\Routing\\Route->runController()

268-#22 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Router.php(808)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Routing/Router.php(808)): Illuminate\\Routing\\Route->run()

269-#23 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(170)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Pipeline/Pipeline.php(170)): Illuminate\\Routing\\Router->Illuminate\\Routing\\{closure}(Object(Illuminate\\Http\\Request))

--

307:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

308-[stacktrace]

309-#0 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php(66)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php(66)): PDO->__construct('mysql:host=gro7...', 'gro7659365_grow', Object(SensitiveParameterValue), Array)

310-#1 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php(44)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php(44)): Illuminate\\Database\\Connectors\\Connector->createPdoConnection('mysql:host=gro7...', 'gro7659365_grow', Object(SensitiveParameterValue), Array)

311-#2 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/MySqlConnector.php(24)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/MySqlConnector.php(24)): Illuminate\\Database\\Connectors\\Connector->createConnection('mysql:host=gro7...', Array, Array)

312-#3 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/ConnectionFactory.php(185)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/ConnectionFactory.php(185)): Illuminate\\Database\\Connectors\\MySqlConnector->connect(Array)

313-#4 [internal function]: Illuminate\\Database\\Connectors\\ConnectionFactory->Illuminate\\Database\\Connectors\\{closure}()

314-#5 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(1231)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(1231)): call_user_func(Object(Closure))

315-#6 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(1267)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(1267)): Illuminate\\Database\\Connection->getPdo()

316-#7 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(512)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(512)): Illuminate\\Database\\Connection->getReadPdo()

317-#8 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(407)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(407)): Illuminate\\Database\\Connection->getPdoForSelect(true)

318-#9 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(812)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(812)): Illuminate\\Database\\Connection->Illuminate\\Database\\{closure}('select * from `...', Array)

319-#10 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(779)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(779)): Illuminate\\Database\\Connection->runQueryCallback('select * from `...', Array, Object(Closure))

320-#11 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(398)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php(398)): Illuminate\\Database\\Connection->run('select * from `...', Array, Object(Closure))

321-#12 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3106)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3106)): Illuminate\\Database\\Connection->select('select * from `...', Array, true)

322-#13 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3091)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3091)): Illuminate\\Database\\Query\\Builder->runSelect()

323-#14 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3676)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3676)): Illuminate\\Database\\Query\\Builder->Illuminate\\Database\\Query\\{closure}()

324-#15 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3090)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Query/Builder.php(3090)): Illuminate\\Database\\Query\\Builder->onceWithColumns(Array, Object(Closure))

325-#16 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(811)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(811)): Illuminate\\Database\\Query\\Builder->get(Array)

326-#17 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(793)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(793)): Illuminate\\Database\\Eloquent\\Builder->getModels(Array)

327-#18 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Concerns/BuildsQueries.php(343)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Concerns/BuildsQueries.php(343)): Illuminate\\Database\\Eloquent\\Builder->get(Array)

328-#19 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(477)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Builder.php(477)): Illuminate\\Database\\Eloquent\\Builder->first(Array)

329-#20 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Support/Traits/ForwardsCalls.php(23)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Support/Traits/ForwardsCalls.php(23)): Illuminate\\Database\\Eloquent\\Builder->find('189')

330-#21 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2372)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2372)): Illuminate\\Database\\Eloquent\\Model->forwardCallTo(Object(Illuminate\\Database\\Eloquent\\Builder), 'find', Array)

331-#22 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2384)](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Model.php(2384)): Illuminate\\Database\\Eloquent\\Model->__call('find', Array)

332-#23 /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/sanctum/src/PersonalAccessToken.php(66)](http://growth-peak.pro/docs/backend/vendor/laravel/sanctum/src/PersonalAccessToken.php(66)): Illuminate\\Database\\Eloquent\\Model::__callStatic('find', Array)

--

380:[2026-08-13 10:52:02] production.WARNING: DbController query failed {"table":"notifications","query":"[eq.is](http://eq.is)_read=false&eq.user_id=7&order=created_at.desc&select=id%2Ctitle%2Cbody%2Curl%2Ccreated_at%2Cis_read%2Ctype","sql":"SQLSTATE[42S22]: Column not found: 1054 Unknown column 'body' in 'field list' (Connection: mysql, SQL: select `id`, `title`, `body`, `url`, `created_at`, `is_read`, `type` from `notifications` where `user_id` = 7 and `is_read` = false order by `created_at` desc)"}

381-[2026-08-13 11:00:43] production.ERROR: Allowed memory size of 67108864 bytes exhausted (tried to allocate 16384 bytes) {"userId":1259,"exception":"[object] (Symfony\\Component\\ErrorHandler\\Error\\FatalError(code: 0): Allowed memory size of 67108864 bytes exhausted (tried to allocate 16384 bytes) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:412](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:412))

382-[stacktrace]

383-#0 {main}

384-"}

385-[2026-08-13 11:00:46] production.ERROR: Allowed memory size of 67108864 bytes exhausted (tried to allocate 16384 bytes) {"userId":1259,"exception":"[object] (Symfony\\Component\\ErrorHandler\\Error\\FatalError(code: 0): Allowed memory size of 67108864 bytes exhausted (tried to allocate 16384 bytes) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:412](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:412))

386-[stacktrace]

387-#0 {main}

388-"}

389-[2026-08-13 11:00:46] production.ERROR: Allowed memory size of 67108864 bytes exhausted (tried to allocate 16384 bytes) {"userId":1259,"exception":"[object] (Symfony\\Component\\ErrorHandler\\Error\\FatalError(code: 0): Allowed memory size of 67108864 bytes exhausted (tried to allocate 16384 bytes) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:412](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:412))

390-[stacktrace]

391-#0 {main}

392-"}

393-[2026-08-13 11:00:49] production.ERROR: Allowed memory size of 67108864 bytes exhausted (tried to allocate 16384 bytes) {"userId":1259,"exception":"[object] (Symfony\\Component\\ErrorHandler\\Error\\FatalError(code: 0): Allowed memory size of 67108864 bytes exhausted (tried to allocate 16384 bytes) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:412](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:412))

394-[stacktrace]

395-#0 {main}

396-"}

397-[2026-08-13 11:00:49] production.ERROR: Allowed memory size of 67108864 bytes exhausted (tried to allocate 16384 bytes) {"userId":1259,"exception":"[object] (Symfony\\Component\\ErrorHandler\\Error\\FatalError(code: 0): Allowed memory size of 67108864 bytes exhausted (tried to allocate 16384 bytes) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:412](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:412))

398-[stacktrace]

399-#0 {main}

400-"}

&nbsp;

## Шаг 2. Сузить причину по данным пользователя

Read-only проверки (без изменений данных):

- Тип и значение `id` пользователя kafedina, его `company_id` и роли (`user_roles`).
- Тип колонок `notifications.user_id`, `notifications.company_id` и наличие колонки `is_read`.
- Есть ли у пользователя роль из числа `hrd/company_admin/superadmin` — от этого зависит ветка `scope=inbox` в `LeaveRequestController::index`.

Это отвечает на два вопроса: (а) не разъезжаются ли типы идентификаторов (bigint против uuid), (б) не падает ли ветка inbox из-за отсутствующей связи/таблицы.

## Шаг 3. Починить найденную причину

Правки делаются только после шага 1–2. Наиболее вероятные зоны (в порядке проверки):

1. `LeaveRequestController::index` — ветка `scope=inbox`: жадные связи `leaveType`/`files` и сравнение `user_id` с выборкой `TeamMember`.
2. `DbController` (ветка `count=exact&head=1`) — построение count-запроса для модели `Notification` (у неё `public $timestamps = false` и глобальный `CompanyScope`).
3. Несоответствие типа ключей пользователя между фронтом и БД, если шаг 2 его подтвердит.

## Шаг 4. Перестать гадать в будущем

Чтобы следующая такая ошибка диагностировалась за один заход, а не за пять:

- В обработчике исключений возвращать в JSON-ответе 500 короткий `error_id` (uuid) и писать этот же `error_id` в лог рядом с URI, ролью и user_id.
- Во фронтовом клиенте показывать `error_id` в тосте ошибки.

Тогда по скриншоту пользователя сразу находится строка лога.

## Критерий готовности

- Под учёткой kafedina стартовая ЛК грузится без 500 в консоли.
- `/api/leave-requests?scope=inbox&status=pending_hr` и счётчик уведомлений отвечают 200.
- В `laravel.log` за период проверки нет новых исключений по этим URI.

## Что в план не входит

- Дальнейшая работа с памятью и `max_user_connections` — эти пункты закрыты и к текущим 500 отношения не имеют, пока лог не покажет обратное.