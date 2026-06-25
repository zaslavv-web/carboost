# План: разобраться с «не тем» .env

## Гипотеза

`php artisan ...` на сервере запускается из директории, где лежит **другой** Laravel (например, симлинк/копия в `~/backend`), и читает свой собственный `.env`. Нужный файл `backend-laravel/.env` при этом не используется вообще. Поэтому правки пароля «не доезжают».

## Что добавим

### 1. Новая команда `smtp:where` (диагностика путей)

Файл `backend-laravel/app/Console/Commands/SmtpWhere.php`. Выводит без раскрытия секретов:

- `base_path()` — корень Laravel, который видит artisan
- `app()->environmentFilePath()` — абсолютный путь к `.env`, который реально грузит фреймворк
- `realpath` этого файла (раскрывает симлинки)
- размер, mtime, владелец, права
- наличие строк `MAIL_PASSWORD=` / `SMTP_PASSWORD=` (только количество и номера строк, без значений)
- текущий `getcwd()` шелла и `php_sapi_name()`
- путь к бинарю PHP (`PHP_BINARY`)

Это сразу покажет: совпадает ли `environmentFilePath()` с `backend-laravel/.env` на VPS.

### 2. Расширение `smtp:status` и `smtp:env-doctor`

В шапку вывода добавить две строки:
```
base_path            : /var/www/.../backend-laravel
env file (loaded)    : /var/www/.../backend-laravel/.env
```
Чтобы при любом запуске было видно, какой именно файл анализируется.

### 3. Поддержка `--env-file=` в `smtp:test` и `smtp:env-doctor`

Если передан `--env-file=/абсолютный/путь/.env`, команда:
- читает указанный файл вручную (vlucas/phpdotenv `Dotenv::createMutable(dir, name)->load()`),
- временно подменяет `MAIL_*` / `SMTP_PASSWORD` в `config('mail')` и `config('service-infra')`,
- выполняет тест/диагностику.

Это даст возможность убедиться, что пароль в `backend-laravel/.env` рабочий, даже если основной artisan читает что-то иное:
```
php artisan smtp:test --env-file=/полный/путь/backend-laravel/.env you@example.com
```

### 4. README-блок «Как найти правильный .env»

Короткая инструкция в `backend-laravel/README.md` (раздел SMTP): запускать artisan ТОЛЬКО из корня `backend-laravel` (`cd backend-laravel && php artisan ...`), и как проверить через `smtp:where`.

## Что сделать на сервере после деплоя

```bash
cd <корень_проекта>
git pull

# 1) Узнать, какой .env реально подхватывается
cd backend-laravel
php artisan smtp:where

# 2) Если путь НЕ /…/backend-laravel/.env — значит artisan
#    исполняется не из той директории. Запускать всегда отсюда.

# 3) Проверить пароль именно в backend-laravel/.env
php artisan smtp:env-doctor --path=$(pwd)/.env

# 4) Тест отправки с принудительной загрузкой нужного файла
php artisan smtp:test --env-file=$(pwd)/.env growthpeak@yandex.ru
```

## Технические детали

- Все новые команды read-only, ничего в БД не пишут.
- Значения паролей по-прежнему НЕ выводятся — только метаданные (длина, флаги, путь).
- Никаких изменений в логике `EmailConfigService` — только наблюдаемость.
- `--env-file` использует `Dotenv\Dotenv::createMutable($dir, $name)->load()`; область действия — только текущая команда.
