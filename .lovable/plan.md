# Почему кнопки «Run workflow» нет: файл deploy-backend.yml невалиден

## Подтверждённая причина

Прогнал YAML-парсер по всем воркфлоу репозитория:

- `.github/workflows/deploy-frontend.yml` — OK, `name = Deploy Frontend`
- `.github/workflows/backup.yml` — OK, `name = Daily DB Backup`
- `.github/workflows/deploy-backend.yml` — **ошибка разбора**: `while scanning a simple key ... line 199, could not find expected ':'`

Виноват блок в шаге «Set PHP runtime limits via .user.ini»: содержимое heredoc `<<'INI'` записано с нулевого отступа (строки 199–203):

```text
198:           cat > public/.user.ini <<'INI'
199: memory_limit = 1024M          <- нулевой отступ обрывает блочный скаляр run:
200: post_max_size = 64M
...
203: INI
```

Для bash это корректно, но для YAML нулевой отступ завершает блок `run: |`, и дальше парсер видит мусор. Отсюда всё, что вы наблюдаете на скриншоте:

- в списке слева воркфлоу подписан путём `.github/workflows/deploy-backend.yml`, а не именем «Deploy Backend» — GitHub не смог прочитать поле `name`;
- все 189 прогонов красные (startup failure), включая последние `633d7d1`, `cfb6751`, `f3de1a1e`;
- кнопки **Run workflow** нет — GitHub не показывает её для воркфлоу с невалидным файлом, поэтому «у меня нет такого workflow».

То есть бэкенд ни разу не выкатывался штатным путём — это и объясняет отсутствие `VERSION`, вложенную `backend-laravel/` и старый `version: 5e9afce` в `/api/health`.

## Что сделать

1. В `.github/workflows/deploy-backend.yml` отступить строки heredoc `INI` (199–203) под блок `run:`, а сам heredoc сделать нечувствительным к отступу: `cat > public/.user.ini <<-'INI'` с табами либо, надёжнее, записать файл через `printf`/несколько `echo` без heredoc.
2. Прогнать локальную проверку разбора всех файлов из `.github/workflows/` YAML-парсером, чтобы убедиться: все читаются и у всех есть `name`.
3. Добавить в `.github/workflows/tests.yml` (или отдельным маленьким шагом) валидацию воркфлоу-файлов, чтобы такая поломка больше не проходила молча в main.
4. После пуша: в Actions воркфлоу должен появиться как «Deploy Backend» с кнопкой **Run workflow** → запустить с `run_migrations = true`, `enable_delete = false`.
5. Проверка результата — по разделу «Как проверить, что деплой реально доехал» в `DEPLOYMENT.md`: `VERSION` совпадает с SHA, `checks.version` в `/api/health` тот же, `backend-laravel/` на сервере отсутствует, `fatals_last_hour` перестаёт расти.

## Технические детали

Правки только в `.github/workflows/deploy-backend.yml` и `.github/workflows/tests.yml`. Код Laravel и фронтенда не трогаем — исправление `enforceResourceAccess` уже в main и просто не было доставлено из-за сломанного воркфлоу.
