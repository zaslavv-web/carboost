## Текущий вывод по диагностике

База для Laravel сейчас работает:

```bash
php artisan config:clear && php artisan migrate --force
# INFO Nothing to migrate.
```

Это означает, что Laravel смог подключиться к базе, прочитать таблицу миграций и проверить состояние схемы.

Ошибка в ручном PDO-тесте не доказывает проблему с БД, потому что команда была запущена с буквальным значением:

```bash
"ПАРОЛЬ"
```

а не с реальным паролем. Пароль сюда лучше не вставлять в чат.

## Что сделать сейчас

### 1. Не трогать рабочий `.env` на сервере

Если `php artisan migrate --force` отвечает `Nothing to migrate`, текущий серверный `.env` уже содержит рабочие `DB_*`.

Нужно только убедиться, что в нём стоит правильный хост:

```bash
cd ~/growth-peak.pro/docs/backend
php artisan tinker --execute='dump(config("database.connections.mysql.host"), config("database.connections.mysql.database"), config("database.connections.mysql.username"));'
```

Ожидаемо:

```text
gro7659365.mysql
gro7659365_grow
gro7659365_grow
```

Пароль эта команда не выводит.

### 2. Исправить GitHub Actions deploy workflow

В `.github/workflows/npm-publish.yml` нужно закрепить правильные дефолты для nic.ru, чтобы будущий деплой снова не откатывал `.env` к `localhost`:

```env
DB_HOST=gro7659365.mysql
DB_PORT=3306
DB_DATABASE=gro7659365_grow
DB_USERNAME=gro7659365_grow
```

`DB_PASSWORD` не хардкодить — только брать из серверного `.env` или GitHub Secret.

Также оставить приоритет:

```text
server .env > GitHub Secrets > safe defaults
```

### 3. Проверить GitHub Secrets

В GitHub repository settings нужно обновить Actions secrets:

```text
DB_HOST=gro7659365.mysql
DB_PORT=3306
DB_DATABASE=gro7659365_grow
DB_USERNAME=gro7659365_grow
DB_PASSWORD=<реальный пароль из nic.ru, не присылать в чат>
```

Это страховка на случай, если `.env` на сервере когда-нибудь будет отсутствовать или повреждён.

### 4. После правки workflow запустить деплой

Ожидаемый результат в CI:

```text
php artisan optimize:clear OK
php artisan config:clear OK
DB preflight OK
php artisan migrate --force OK
php artisan config:cache OK
php artisan route:cache OK
```

## Что я изменю после подтверждения

Только `.github/workflows/npm-publish.yml`:

"gro7659365.mysql" // vendor/psy/psysh/src/ExecutionClosure.php(41) : eval()'d code:1

"gro7659365_d" // vendor/psy/psysh/src/ExecutionClosure.php(41) : eval()'d code:1

"gro7659365_grow" // vendor/psy/psysh/src/ExecutionClosure.php(41) : eval()'d code:1

ты опять перепутал значения корректно то, что я тебе присылаю

&nbsp;

- заменю дефолтный `DB_HOST=localhost` на `DB_HOST=gro7659365.mysql`;
- закреплю `DB_PORT=3306`;
- закреплю дефолтные `DB_DATABASE` и `DB_USERNAME` под `gro7659365_grow`;
- не буду добавлять пароль в код;
- сохраню приоритет серверного `.env`, чтобы ручные настройки VPS больше не затирались.