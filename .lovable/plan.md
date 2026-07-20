## Что происходит

Вы находитесь в `docs/backend` — это Laravel-приложение (там только `package.json` для Blade-ассетов, нет `vite.config.ts`, нет папки `deploy/`).

React-фронтенд (тот, где лежит `vite.config.ts`, `src/`, `deploy/deploy-frontend.sh`) — это **отдельный корень репозитория Lovable**. Судя по прошлому `git pull`, на сервере он тоже склонирован, просто в другом месте — надо его найти.

## План

### Шаг 1. Найти корень React-репо на сервере

```bash
cd ~
find /home/gro7659365 -maxdepth 6 -name vite.config.ts 2>/dev/null
```

Ожидаем одну строку вида `/home/gro7659365/.../vite.config.ts`. Каталог, где она лежит, — искомый корень (там же будут `package.json`, `src/`, `deploy/`, `.git`).

Если находок **нет** — репо Lovable на сервер ещё не клонировали. Тогда клонируем рядом с Laravel:

```bash
cd /home/gro7659365/growth-peak.pro
git clone <URL_репозитория_Lovable> frontend
cd frontend
```

а это где взять?

(URL — тот же, откуда обычно делаете `git pull`; если не помните — скажите, подскажу как посмотреть через `git remote -v` в любом из существующих чекаутов.)

### Шаг 2. Обновить и задеплоить

Из найденного корня React-репо:

```bash
git pull
ls vite.config.ts deploy/deploy-frontend.sh   # обе строки должны найтись
WEB_ROOT=/usr/share/nginx/html bash deploy/deploy-frontend.sh
```

Скрипт сам выполнит `npm install`, `npm run build` и атомарно подменит `dist/` в `WEB_ROOT` с бэкапом предыдущей версии.

### Шаг 3. Проверить

Открыть `https://growth-peak.pro` под HRD → в классическом сайдбаре внизу над «Выйти» должна появиться кнопка «Режим Today».

## Что мне нужно от вас сейчас

Запустите шаг 1 (`find ...`) и пришлите вывод — от него зависит, деплоим из существующего каталога или сначала клонируем.