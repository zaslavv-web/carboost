
## Проблема

`/api/diag` на продакшене возвращает:
- `commit: "unknown"`
- нет `deploy_marker`
- нет `routes.has_assign_company`

Это значит, что автосинхронизация с git на сервере **не подхватила последние коммиты**. Поэтому новый бэкенд-роут `PATCH /api/admin/users/{userId}/company` отсутствует в продакшене, и фронт получает ошибку при назначении компании пользователю.

Нужно сначала восстановить деплой, потом проверить, что роут зарегистрирован.

## Шаги

### 1. Проверить, что именно сломано в автосинке (нужен доступ к серверу)

Попросить пользователя выполнить на сервере и прислать вывод:

```bash
cd /path/to/repo
git log -1 --oneline
git status
git remote -v
sudo systemctl status laravel-deploy.service laravel-deploy.timer 2>/dev/null || true
sudo systemctl status git-sync.service git-sync.timer 2>/dev/null || true
ls -la deploy/
tail -n 100 /var/log/laravel-deploy.log 2>/dev/null || true
```

Цель — понять:
- какой коммит сейчас на сервере (должен совпадать с `main`);
- какой механизм синка используется (cron, systemd timer, webhook, git hook);
- есть ли свежие логи деплоя и какие там ошибки.

### 2. Усилить `deploy/deploy-laravel.sh`

- В начале скрипта добавить `set -euo pipefail` (если ещё нет) и явный `git fetch --all --prune && git reset --hard origin/main`, чтобы синк всегда приводил рабочую копию в состояние ремоута.
- Записывать текущий коммит в файл, который читает `/api/diag`:
  ```bash
  git rev-parse --short HEAD > backend-laravel/storage/app/VERSION
  ```
  и в `/api/diag` читать его (fallback на `unknown`).
- Логировать каждый шаг в `/var/log/laravel-deploy.log` с таймстампом, чтобы было видно, доходит ли скрипт до `route:cache`.
- Уже сделанное оставить: `route:clear` перед `route:cache`, `route:list --path=admin/users` для верификации.

### 3. Настроить надёжный триггер автосинка

Варианты (выбирает пользователь, по доступу на сервере):
- **systemd timer** каждые 1–2 минуты: `git fetch && git reset --hard origin/main && deploy/deploy-laravel.sh`.
- **GitHub webhook** → маленький endpoint (или `webhook` от adnanh) → запускает `deploy-laravel.sh`.
- **post-receive hook** на bare-репо, если на сервере push идёт напрямую.

Любой вариант должен:
- запускаться от пользователя с правами на `chown` файлов Laravel и `php artisan`;
- логировать stdout/stderr в файл;
- не падать молча.

### 4. Проверка после починки

1. Открыть `https://growth-peak.pro/api/diag`. Должно быть:
   - `commit` = короткий хэш последнего коммита `main` (не `unknown`);
   - `deploy_marker: "assign-company-route-probe-2026-06-05-01"`;
   - `routes.has_assign_company: true`.
2. Если всё ок — повторить операцию «назначить компанию пользователю» в UI. Ошибка должна уйти.
3. Если `commit` обновился, но `has_assign_company: false` — проблема не в деплое, а в самой регистрации роута (порядок middleware/группы, кеш роутов на другой ноде, балансировщик с двумя бэкендами и т. п.) — будем смотреть `route:list` с сервера.

### 5. Уборка после диагностики

После того как всё заработает:
- Убрать `deploy_marker` и `route_probe` из `/api/diag` (оставить только базовый health-check + `commit`).
- Вернуть `assignCompanyMutation.onError` к простому `toast.error(msg)` без debug-полей.

## Что нужно от пользователя сейчас

1. Доступ или вывод команд из шага 1 (как минимум `git log -1`, `git status` и логи деплоя на сервере).
2. Подтверждение, какой механизм автосинка используется (cron / systemd / webhook / git hook) — чтобы я знал, какой файл править.

Без этой информации я могу только улучшить сам `deploy-laravel.sh`, но не гарантирую, что он будет запускаться автоматически.
