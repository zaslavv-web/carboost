# Починить 500 на deep links: деплой фикса .htaccess

## Диагноз (подтверждён проверкой продакшена)

На `growth-peak.pro` сервер отдаёт версию `ae87136` — это старый коммит. Фикс `.htaccess` (устранение петли редиректов) лежит в HEAD `8db0c048`, но **не задеплоен**.

| URL | HTTP | Причина |
|-----|------|---------|
| `/version.json` | 200 | Реальный файл, pass-through срабатывает |
| `/manifest.json` | 200 | Реальный файл |
| `/dashboard` | **500** | Петля редиректов в старом `.htaccess` |
| `/kedo` | **500** | Та же петля |
| `/api/health` | 200 | API-роут работает |

Старый `.htaccess` на сервере ссылается на `frontend/` (симлинк на корень) → каждый deep link уходит в бесконечный цикл `frontend/index.html` → 500.

## Что уже сделано (в репозитории, commit `8db0c048`)

`public/.htaccess` переписан:
- Убраны все ссылки на `frontend/`
- Pass-through: `RewriteCond %{REQUEST_FILENAME} -f [OR] -d` → реальные файлы отдаются напрямую
- SPA-фолбэк: `RewriteCond %{REQUEST_URI} !^/index\.html$` + `RewriteRule ^ /index.html [L]` — один редирект, без цикла
- Кэш-заголовки для `index.html`, `version.json`, `manifest.json` (no-store) и ассетов (immutable)

## Что нужно сделать

### 1. Деплой свежего коммита (единственное действие)
Запустить workflow **Deploy Frontend** из коммита `8db0c048` (или дождаться авто-деплоя от push, если он ещё идёт).

Проверить, что `version.json` на сервере отдаёт `8db0c04`:
```
curl -s https://growth-peak.pro/version.json
```

### 2. Верификация после деплоя
Проверить все роуты:
```
/version.json   → 200, версия 8db0c04
/dashboard      → 200 (text/html, SPA-фолбэк)
/kedo           → 200
/employee-map   → 200
/access-control → 200
/api/health     → 200
/manifest.json  → 200
```

Если хоть один deep link отдаёт 500 — проверить `error_log` на сервере через SSH-шаг из workflow.

### 3. Опционально: убрать старый симлинк `frontend/`
Если на сервере в веб-руте остался `frontend/` (симлинк на корень или старая папка), его можно удалить — новый `.htaccess` его не использует. Добавить шаг в workflow:
```bash
ssh $DEPLOY_USER@$DEPLOY_HOST "rm -f $WEB_ROOT/frontend"
```

## Критерий готовности
Все 7 URL выше отдают 200, `version.json` содержит `8db0c04`, ни один deep link не отдаёт 500.
