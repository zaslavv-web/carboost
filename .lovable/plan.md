# План диагностики отправки писем

Каркас Laravel (`backend-laravel/app-src/`) генерируется `bootstrap.sh` при деплое — поэтому ни `storage/`, ни логов в гите нет, всё создаётся на сервере. Диагностируем напрямую на VPS через SSH.

## Шаг 1. Команды для проверки на сервере

Подключись по SSH и из директории, где лежит `docker-compose.yml`, выполни (подставь имя сервиса backend — обычно `app` или `backend`):

```bash
# 1. Убедиться, что свежий код задеплоен (есть строка про notifySales)
docker compose exec backend grep -n "Sales notification" app/Http/Controllers/Api/RpcController.php

# 2. Проверить, что .env внутри контейнера действительно содержит SMTP/SALES
docker compose exec backend sh -c 'grep -E "MAIL_|SALES_NOTIFICATION_EMAIL" .env'

# 3. Сбросить кэш конфига (Laravel часто кэширует .env)
docker compose exec backend php artisan config:clear
docker compose exec backend php artisan cache:clear

# 4. Хвост лога с фильтром по нашим меткам
docker compose exec backend tail -n 500 storage/logs/laravel.log | grep -E "Sales notification|swift|SMTP|mail" -i

# 5. Тестовая отправка напрямую через tinker — самая полезная проверка
docker compose exec backend php artisan tinker --execute="\
  Mail::raw('test from growth-peak', function(\$m){ \$m->to('growthpeak@yandex.ru')->subject('SMTP test'); }); \
  echo 'ok';"
```

Если шаг 5 падает — увидишь точное исключение (auth failed, connection refused, SSL и т.д.). Если шаг 5 проходит, а заявки не уходят — проблема в `notifySales` (например, `EmailConfigService` подсовывает пустые настройки из БД).

## Шаг 2. По результатам — узкие фиксы (только после твоего ответа)

В зависимости от того, что покажет лог/tinker, я внесу одно из:

- **SMTP auth fail на Яндексе** → Яндекс с октября 2024 требует пароль приложения именно для SMTP и логин в формате полного email; проверим `MAIL_USERNAME=growthpeak@yandex.ru` и что пароль — application password, а не от аккаунта.
- **`stream_socket_enable_crypto(): SSL: …`** → переключим `MAIL_ENCRYPTION=ssl` (lowercase) либо порт 587 + `tls`.
- **`EmailConfigService` затирает env пустыми значениями из таблицы `email_settings`** → правим `RpcController::notifySales`, чтобы при пустой записи в БД использовался `.env` без вызова `apply()`.
- **Конфиг закэширован** → добавим в `bootstrap.sh`/деплой шаг `php artisan config:clear` после старта контейнера.
- **Письма уходят, но падают в спам Яндекса** → добавим SPF/DKIM-рекомендации и `Return-Path`.

## Шаг 3. Постоянная страховка в админке

Чтобы в будущем не лазить по SSH, добавлю в Superadmin → Настройки кнопку **«Тест SMTP»**: отправляет тестовое письмо на адрес из `sales_recipient` и показывает результат / исключение прямо в UI. Это маленькая правка одного контроллера + одной страницы, без изменений бизнес-логики.

---

После аппрува: дай вывод команд 1–5 — я по ним сразу определю причину и сделаю целевой фикс + кнопку «Тест SMTP».
