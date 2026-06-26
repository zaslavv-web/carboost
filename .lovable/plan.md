## Проблема

На VPS Laravel пытается подключиться к Redis по hostname `redis:6379` (это имя из docker-compose сети). Но на growth-peak.pro нет Docker и нет сервиса Redis — отсюда `getaddrinfo for redis failed`.

Ошибка вылезает потому, что в `backend-laravel/.env` стоит:

```
CACHE_STORE=redis
QUEUE_CONNECTION=redis
SESSION_DRIVER=redis
REDIS_HOST=redis
```

И любой запрос (включая отправку письма через очередь / запись в кеш / сессию) валится.

## Решение

Перевести Laravel на драйверы, не требующие Redis. На shared-хостинге без Docker самый надёжный вариант — `database` + `file`.

### Шаг 1. Поправить `backend-laravel/.env` на сервере

Заменить блок Redis на:

```
CACHE_STORE=file
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
# REDIS_* можно удалить или закомментировать
```

Почему так:

- `SESSION_DRIVER=file` — сессии в `storage/framework/sessions/`, ничего не нужно.
- `CACHE_STORE=file` — кеш в `storage/framework/cache/`.
- `QUEUE_CONNECTION=sync` — письма (включая Unisender Go) отправляются прямо в HTTP-запросе, без воркера. Для текущего объёма (демо-заявки, pricing inquiries) этого достаточно.

Если позже захотим асинхронные очереди — переключим на `database` и поднимем `php artisan queue:work` через supervisor. Сейчас это не нужно.

почему?

### Шаг 2. Сбросить кеш конфига

```
php artisan config:clear
php artisan cache:clear
php artisan config:cache
```

### Шаг 3. Обновить шаблоны, чтобы повторно не наступить

- `backend-laravel/.env.example` и `backend-laravel/.env.production.example` — поставить дефолты `file/sync/file` вместо `redis`, чтобы on-premise установки без Docker заводились из коробки. Docker-overlay (`docker-compose.yml`) при необходимости переопределяет на `redis` через свои env-переменные.
- В `DEPLOYMENT.md` / `docs/ON-PREMISE.md` добавить короткую заметку: «Redis нужен только для docker-compose стека; на shared-хостинге используйте file/sync».

### Шаг 4. Проверка

После правки `.env` и сброса кеша:

```
php artisan unisender:test you@example.com
```

должна вернуть `OK` без `getaddrinfo for redis failed`.

## Что я НЕ трогаю

- Docker-compose файлы и сетевую конфигурацию контейнеров — там Redis нужен и работает.
- Код приложения — драйверы переключаются через env, исходники менять не надо.

Подтвердите план — переключаюсь в build и применяю изменения к `.env.example` файлам и докам. Правку `.env` на самом VPS делаете вы (или я подскажу точные команды `sed`).