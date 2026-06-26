## Причина

Аккаунт Growth Peak находится на шарде **go2**, а наш транспорт по умолчанию бьёт в `go1`. Поэтому Unisender принимает ключ как валидный по формату, но не находит пользователя в этом шарде → ошибка 114 `User with id ... not found`.

## Что меняем

Меняем дефолтный endpoint и фиксируем его через `.env`, чтобы при смене шарда не пришлось править код.

### 1. `backend-laravel/app/Mail/Transport/UnisenderGoTransport.php`
В конструкторе по умолчанию заменить
```
https://go1.unisender.ru/...
```
на
```
https://go2.unisender.ru/ru/transactional/api/v1/email/send.json
```

### 2. `backend-laravel/config/mail.php`
В блоке `unisender_go` поменять дефолт `UNISENDER_GO_ENDPOINT` на `go2`-URL (env-override продолжает работать).

### 3. `backend-laravel/.env` (на VPS, вручную)
Добавить явную строку (на случай, если позже поменяется шард):
```
UNISENDER_GO_ENDPOINT=https://go2.unisender.ru/ru/transactional/api/v1/email/send.json
```

### 4. `backend-laravel/app/Console/Commands/SmtpStatus.php`
Дописать вывод текущего endpoint, чтобы в будущем сразу видеть, какой шард используется.

## Шаги на VPS после деплоя

```bash
cd ~/growth-peak.pro/docs/backend
git pull   # или ваш способ доставки
# (опционально) зафиксировать endpoint в .env
grep -q '^UNISENDER_GO_ENDPOINT=' .env \
  || echo 'UNISENDER_GO_ENDPOINT=https://go2.unisender.ru/ru/transactional/api/v1/email/send.json' >> .env
php artisan config:clear && php artisan config:cache
php artisan smtp:status
php artisan unisender:test zaslavv@yandex.ru
```

Ожидаем `OK — письмо отправлено` и письмо в ящике.
