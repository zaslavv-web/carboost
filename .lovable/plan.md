## Что показывает лог

```
[2026-06-29 17:27:25] production.ERROR: admin password reset failed
{"email":"my.opprt@yandex.ru","err":"...localhost:587 (Connection refused)"}
```

В этой строке **нет поля `channel`**. А в текущем коде репозитория (`UsersController.php:172`) лог пишется так:

```php
\Log::error('admin password reset failed', ['email' => $email, 'channel' => $channel, 'err' => ...]);
```

Значит на проде крутится **старая версия файла** — мой прошлый фикс с ветвлением по `activeChannel()` туда не доехал. Параллельно надо убедиться, что `Password::sendResetLink` реально уходит через Unisender Go, а не через дефолтный mailer (иначе фикс ветвления ничего не даст — Notification возьмёт `config('mail.default') = smtp` и снова полезет на `localhost:587`).

И отдельно: токен `my.opprt@yandex.ru` действительно протух (486 мин > 180 мин лимита) — пользователю в любом случае нужна новая ссылка.

## План

### 1. Проверить, что фикс UsersController задеплоен на prod
На сервере:
```bash
cd /home/gro7659365/backend
grep -n "channel" app/Http/Controllers/Api/Admin/UsersController.php | head
git log -1 --format='%h %s %ci' app/Http/Controllers/Api/Admin/UsersController.php
```
Если `channel` в файле нет — автодеплой не прошёл. Тогда:
```bash
git pull --ff-only
php artisan optimize:clear
```

### 2. Убедиться, что Password::sendResetLink идёт через Unisender Go
Сейчас `EmailConfigService::apply()` для unisender_go должен переключать `config(['mail.default' => 'unisender_go'])` в рантайме. Проверю в `EmailConfigService::apply()`, что для канала `unisender_go`:
- ставится `mail.default = unisender_go`
- транспорт зарегистрирован в `AppServiceProvider`/`MailServiceProvider` через `Mail::extend('unisender_go', ...)`
- `mail.mailers.unisender_go` определён в `config/mail.php`

Если чего-то нет — починю в коде репо (стадия build).

### 3. Дать пользователю новую ссылку
- Сообщить: текущий токен `my.opprt@yandex.ru` истёк (486 мин). После шагов 1–2 нажать «Сбросить пароль» из суперадмина ещё раз — придёт свежее письмо через Unisender Go.
- Альтернативно — временный workaround: `php artisan superadmin:reset-password my.opprt@yandex.ru <newPass>` (если нужна разовая разблокировка без email).

### 4. Подтвердить фикс
```bash
php artisan password:reset-status my.opprt@yandex.ru
tail -f storage/logs/laravel.log | grep -i "password reset"
```
Ожидаемый success-лог должен исчезнуть с ошибкой `localhost:587`; новый токен должен быть `ACTIVE`.

## Что мне нужно от вас

1. Вывод `grep -n "channel" app/Http/Controllers/Api/Admin/UsersController.php` с прода — подтвердит/опровергнет, что фикс задеплоен.
2. Подтверждение, что в `.env` на проде стоит `MAIL_MAILER=unisender_go` (или хотя бы `UNISENDER_GO_API_KEY` задан и `email_settings` в БД активирует канал unisender_go).

После этого либо триггерну редеплой (если ветвление не доехало), либо добавлю недостающую часть переключения mailer в `EmailConfigService::apply()`.