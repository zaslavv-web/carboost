
## Диагноз

**Проблема 1 — SMTP не видит новый пароль.**
В коде `RpcController::notifySales` вызывается `EmailConfigService`, который грузит настройки из таблицы `email_settings` (admin UI). Если в БД сохранены старые значения, они **перекрывают `.env`**. Поэтому смена `MAIL_PASSWORD` в `.env` ничего не дала — Laravel читает пароль из БД.

**Проблема 2 — сброс пароля суперадмина.**
Сброс отправляется по почте — а почта как раз не работает. Замкнутый круг. Решение — сбросить пароль напрямую в БД через SSH (`php artisan tinker`).

---

## Шаги

### 1. Обновить SMTP-пароль в БД (источник истины)

На сервере в `/home/gro7659365/growth-peak.pro/docs/backend`:

```bash
php artisan tinker --execute="
\$s = DB::table('email_settings')->first();
print_r(['host'=>\$s->smtp_host,'user'=>\$s->smtp_username,'pass_len'=>strlen(\$s->smtp_password ?? '')]);
"
```

Если запись есть — обновить пароль:
```bash
php artisan tinker --execute="
DB::table('email_settings')->update([
  'smtp_password' => 'НОВЫЙ_ПАРОЛЬ_ПРИЛОЖЕНИЯ',
  'smtp_host' => 'smtp.yandex.ru',
  'smtp_port' => 465,
  'smtp_encryption' => 'ssl',
  'smtp_username' => 'growthpeak@yandex.ru',
  'from_address' => 'growthpeak@yandex.ru',
  'from_name' => 'Growth Peak',
]);
"
php artisan config:clear && php artisan cache:clear
```

Если записи нет — `EmailConfigService` упадёт на .env, тогда проверим что `.env` действительно перезагружен:
```bash
php artisan tinker --execute="echo config('mail.mailers.smtp.password');"
```

### 2. Тест отправки

```bash
php artisan tinker --execute="
Mail::raw('test', fn(\$m)=>\$m->to('growthpeak@yandex.ru')->subject('SMTP test'));
echo 'ok';
"
tail -n 50 storage/logs/laravel.log
```

Если опять `535 Authentication failed` — пароль в Яндексе невалидный. Перевыпустить **Пароль приложения → Почта** на id.yandex.ru (именно «Почта», не общий, и без пробелов при копировании — Яндекс показывает с пробелами, но вводить надо слитно).

### 3. Сбросить пароль суперадмина

```bash
php artisan tinker --execute="
\$u = App\Models\User::where('email','EMAIL_СУПЕРАДМИНА')->first();
\$u->password = Hash::make('ВРЕМЕННЫЙ_ПАРОЛЬ');
\$u->save();
echo 'done';
"
```

После входа сменить пароль в UI.

### 4. Доработка кода (опционально, чтобы не повторялось)

Добавить в админку **Email Settings** кнопку **«Сбросить к .env»**, очищающую `email_settings`, чтобы Laravel падал на конфиг из окружения. И вывести в UI текущий источник конфига (DB / .env) — сейчас непонятно, что именно используется.

---

## От тебя нужно

1. Email суперадмина (для шага 3).
2. Новый временный пароль (или сгенерировать?).
3. Подтверждение что нужно делать шаг 4 (UI-улучшения) сразу или потом.
