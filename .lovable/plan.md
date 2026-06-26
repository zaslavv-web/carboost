## Проблема

В `.github/workflows/npm-publish.yml` шаг «Create backend .env» подставляет `DB_HOST`/`DB_PORT`/`DB_DATABASE`/`DB_USERNAME`/`DB_PASSWORD` напрямую из GitHub Secrets и записывает их в `app-src/.env`, который затем заливается на VPS поверх рабочего `backend/.env`. Реальный пароль MySQL на Beget вы меняли через панель хостинга и в GitHub Secrets он не обновлён → `php artisan migrate` валится с `SQLSTATE[HY000] [1045] Access denied for user '***'@'localhost'`.

Раньше та же проблема была с MAIL_*; мы её решили, считывая значения из существующего `/backend/.env` на сервере и подставляя их вместо плейсхолдеров. Сейчас нужно повторить ту же схему для DB_*.

## Что меняю

Файл: `.github/workflows/npm-publish.yml`

1. В шаге «Create backend .env» вместо прямой подстановки `DB_*` из секретов писать плейсхолдеры `__PRESERVE_SERVER_DB_HOST__`, `__PRESERVE_SERVER_DB_PORT__`, `__PRESERVE_SERVER_DB_DATABASE__`, `__PRESERVE_SERVER_DB_USERNAME__`, `__PRESERVE_SERVER_DB_PASSWORD__`, `__PRESERVE_SERVER_DB_CONNECTION__`, если соответствующий GitHub Secret пуст. Если секрет задан — использовать его как fallback.

2. В шаге «Deploy backend» расширить SSH-чтение серверного `.env`: добавить в `grep` ключи `DB_CONNECTION|DB_HOST|DB_PORT|DB_DATABASE|DB_USERNAME|DB_PASSWORD` и тот же python-блок, что обрабатывает MAIL_*, расширить, чтобы он:
   - читал значения DB_* из серверного `.env`,
   - подставлял их с приоритетом над сгенерированными,
   - заменял плейсхолдеры `__PRESERVE_SERVER_DB_*__` финальными значениями.

3. Логика приоритетов (как у MAIL_*): server `.env` > GitHub Secret > дефолт. Дефолт для `DB_CONNECTION` — `mysql`, для `DB_HOST` — `localhost`, для `DB_PORT` — `3306`. Для `DB_DATABASE/USERNAME/PASSWORD` дефолта нет — если ни на сервере, ни в секретах нет значения, деплой падает с понятной ошибкой.

4. Сохранить совместимость: если сервер ещё не инициализирован (нет `backend/.env`), деплой использует GitHub Secrets как раньше.

## Результат

- При следующем деплое DB-блок в `backend/.env` на VPS останется тем, который вы прописали вручную (с правильным паролем Beget).
- Миграции и сидеры пройдут.
- Менять пароль БД через Beget можно будет, не трогая GitHub Secrets.

## После внедрения

Запустить деплой (push в `main`) и проверить, что шаг `php artisan migrate --force` отработал без `Access denied`.
