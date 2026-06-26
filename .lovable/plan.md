Отлично, `artisan` найден по пути `./growth-peak.pro/docs/backend/artisan`. Значит корень Laravel-бэкенда на VPS — `~/growth-peak.pro/docs/backend`.

## Что сделать на VPS

```bash
cd ~/growth-peak.pro/docs/backend

# 1. Проверяем, что .env здесь есть
ls -la artisan .env
-rwxr-xr-x. 1 gro7659365 gro7659365  350 янв 24  2025 artisan
-rw-r--r--. 1 gro7659365 gro7659365 1448 июн 26 18:32 .env

```

Если `.env` отсутствует — сначала создаём из шаблона:

```bash
cp .env.production.example .env
# затем отредактируйте: APP_KEY, DB_*, MAIL_MAILER=unisender_go,
# MAIL_FROM_ADDRESS=noreply@mail.growth-peak.pro, UNISENDER_GO_API_KEY=...
php artisan key:generate
```

Если `.env` уже есть — переключаем кэш/очередь/сессии с Redis на файловые драйверы:

```bash
sed -i 's/^CACHE_STORE=.*/CACHE_STORE=file/;s/^QUEUE_CONNECTION=.*/QUEUE_CONNECTION=sync/;s/^SESSION_DRIVER=.*/SESSION_DRIVER=file/' .env
ничего не произошло

# Если каких-то ключей в .env вовсе нет — добавим:
grep -q '^CACHE_STORE='       .env || echo 'CACHE_STORE=file'       >> .env
grep -q '^QUEUE_CONNECTION='  .env || echo 'QUEUE_CONNECTION=sync'  >> .env
grep -q '^SESSION_DRIVER='    .env || echo 'SESSION_DRIVER=file'    >> .env
```

ничего не произошло

Сбрасываем кэш конфигурации и проверяем канал отправки:

```bash
php artisan config:clear
php artisan cache:clear
php artisan config:cache

php artisan smtp:status
php artisan unisender:test ваш-личный@email
=== TEST EMAIL ===
Канал       : smtp
From        : growthpeak@yandex.ru
To          : zaslavv@yandex.ru
Ошибка отправки: Failed to authenticate on SMTP server with username "growthpeak@yandex.ru" using the following authenticators: "LOGIN", "PLAIN", "XOAUTH2". Authenticator "LOGIN" returned "Expected response code "235" but got code "535", with message "535 5.7.8 Error: authentication failed: Invalid user or password! 1782488295-Ecc7aPTeJW20".". Authenticator "PLAIN" returned "Expected response code "235" but got code "535", with message "535 5.7.8 Error: authentication failed: Invalid user or password! 1782488295-Ecc7aPTeJW20".". Authenticator "XOAUTH2" returned "Expected response code "235" but got code "535", with message "535 5.7.8 Error: authentication failed: Invalid user or password! 1782488295-Ecc7aPTeJW20".".

```

## Что должно получиться

- `smtp:status` показывает `MAIL_MAILER=unisender_go` и длину API-ключа > 0.
- `unisender:test` пишет `OK` и письмо приходит на указанный адрес (проверьте папку «Спам», т.к. DNS-записи ещё не добавлены — после добавления SPF/DKIM/DMARC доставляемость в инбокс будет нормальной).

## Если что-то пойдёт не так

- `Could not open input file: artisan` → вы не в той папке, вернитесь в `~/growth-peak.pro/docs/backend`.
- `unisender:test` отвечает 401/403 → неверный `UNISENDER_GO_API_KEY` в `.env`, перепроверьте и снова `php artisan config:cache`.
- Письмо не приходит и нет ошибки → пришлите вывод `tail -n 100 storage/logs/laravel.log`, разберу.

Изменения в коде не требуются — это разовая операция на сервере. Подтвердите план, и я переключусь в build-режим, чтобы при необходимости донастроить .env.example/докуменацию под путь `docs/backend`.