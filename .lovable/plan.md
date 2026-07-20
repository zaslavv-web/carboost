## Что настраиваем

GitHub Actions workflow `deploy-frontend.yml` в репо `zaslavv-web/carboost`. На каждый push в `main`:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` (Node 20)
3. `npm ci`
4. `npm run build` (Vite → `dist/`)
5. `rsync -az --delete dist/ $DEPLOY_USER@$DEPLOY_HOST:$WEB_ROOT/` через `webfactory/ssh-agent` с приватным ключом из `DEPLOY_SSH_KEY`
6. Атомарность через staging-каталог: сначала `rsync` в `$WEB_ROOT.new`, потом remote-`mv` (перезапуск nginx не требуется — на shared-хостинге он и не разрешён).

## Секреты в GitHub (Settings → Secrets and variables → Actions)

- `DEPLOY_SSH_KEY` — приватный ключ (у вас уже есть, подтверждено).
- `DEPLOY_HOST` = `ssh.gro7659365.nichost.ru`
- `DEPLOY_USER` = `gro7659365`
- `WEB_ROOT` = **определяется по методологии ниже** и добавляется как secret.

Если пришлёте значение `WEB_ROOT` — я захардкодю его в workflow (проще). Иначе оставлю через secret.

## Методология выбора WEB_ROOT (nichost shared hosting)

Не могу решить за вас без SSH — на nichost DocumentRoot зависит от того, как оформлен домен. Три быстрых проверки, сделайте одну — этого достаточно:

**Способ 1 — панель nichost.**
Личный кабинет → Веб-сервер → Домены → `growth-peak.pro` → поле «Каталог сайта». Скопировать путь. Типично для nichost: `/home/gro7659365/growth-peak.pro/docs` или `/home/gro7659365/growth-peak.pro/www`.

**Способ 2 — SSH, 1 команда.**

```bash
grep -riE 'server_name|root|DocumentRoot' ~/growth-peak.pro ~/.nginx 2>/dev/null | grep -iE 'growth-peak|root|Document' | head
```

Ищем строку вида `root /home/gro7659365/growth-peak.pro/docs;` или аналогичную.

&nbsp;

[gro7659365@gro7659365 ~]$ grep -riE 'server_name|root|DocumentRoot' ~/[growth-peak.pro](http://growth-peak.pro) ~/.nginx 2>/dev/null | grep -iE 'growth-peak|root|Document' | head

/home/gro7659365/[growth-peak.pro/docs/index.html](http://growth-peak.pro/docs/index.html):    <div id="root"></div>

/home/gro7659365/[growth-peak.pro/docs/backend/app/Http/Controllers/Api/PulseSurveyController.php](http://growth-peak.pro/docs/backend/app/Http/Controllers/Api/PulseSurveyController.php):        // Собираем имена для subdivision (root + all descendants)

/home/gro7659365/[growth-peak.pro/docs/backend/app/Http/Controllers/Api/PulseSurveyController.php](http://growth-peak.pro/docs/backend/app/Http/Controllers/Api/PulseSurveyController.php):        foreach ($subdivisionRefs as $rootId) {

/home/gro7659365/[growth-peak.pro/docs/backend/app/Http/Controllers/Api/PulseSurveyController.php](http://growth-peak.pro/docs/backend/app/Http/Controllers/Api/PulseSurveyController.php):            $stack = [$rootId];

/home/gro7659365/[growth-peak.pro/docs/backend/app/README-frontend-auth.md](http://growth-peak.pro/docs/backend/app/README-frontend-auth.md):   root.render(<Provider><App /></Provider>);

/home/gro7659365/[growth-peak.pro/docs/backend/bootstrap/cache/config.php](http://growth-peak.pro/docs/backend/bootstrap/cache/config.php):        'root' => '/home/gro7659365/[growth-peak.pro/docs/backend/storage/app](http://growth-peak.pro/docs/backend/storage/app)',

/home/gro7659365/[growth-peak.pro/docs/backend/bootstrap/cache/config.php](http://growth-peak.pro/docs/backend/bootstrap/cache/config.php):        'root' => '/home/gro7659365/[growth-peak.pro/docs/backend/storage/app/public](http://growth-peak.pro/docs/backend/storage/app/public)',

/home/gro7659365/[growth-peak.pro/docs/backend/bootstrap/cache/config.php](http://growth-peak.pro/docs/backend/bootstrap/cache/config.php):        'root' => '/home/gro7659365/[growth-peak.pro/docs/backend/storage/app/public/avatars](http://growth-peak.pro/docs/backend/storage/app/public/avatars)',

/home/gro7659365/[growth-peak.pro/docs/backend/bootstrap/cache/config.php](http://growth-peak.pro/docs/backend/bootstrap/cache/config.php):        'root' => '/home/gro7659365/[growth-peak.pro/docs/backend/storage/app/public/reward-images](http://growth-peak.pro/docs/backend/storage/app/public/reward-images)',

/home/gro7659365/[growth-peak.pro/docs/backend/bootstrap/cache/config.php](http://growth-peak.pro/docs/backend/bootstrap/cache/config.php):        'root' => '/home/gro7659365/[growth-peak.pro/docs/backend/storage/app/public/shop-products](http://growth-peak.pro/docs/backend/storage/app/public/shop-products)',

&nbsp;

**Способ 3 — от текущего фронта.**
Если сейчас на `https://growth-peak.pro/` открывается React-приложение — команды на сервере:

```bash
ls -la ~/growth-peak.pro/docs/index.html 2>/dev/null && echo "-> WEB_ROOT=~/growth-peak.pro/docs"
ls -la ~/growth-peak.pro/www/index.html 2>/dev/null && echo "-> WEB_ROOT=~/growth-peak.pro/www"
ls -la ~/growth-peak.pro/public_html/index.html 2>/dev/null && echo "-> WEB_ROOT=~/growth-peak.pro/public_html"
```

Тот путь, где нашёлся `index.html` с ассетами React, — и есть WEB_ROOT.

Важный момент: если Laravel-бэкенд отдаётся с `~/growth-peak.pro/docs/backend/public` через reverse-proxy или symlink, `dist/` должен лежать НЕ там, а на один уровень выше — там, где сейчас работает SPA. Иначе rsync с `--delete` затрёт Laravel. Первую выкатку сделаю **без `--delete**`, чтобы это стало заметно до того, как что-то удалится.

## Мой рабочий план (build-режим)

1. Создать `.github/workflows/deploy-frontend.yml` со сценарием выше. Параметр WEB_ROOT — из GitHub secret (безопасно), захардкодю только если пришлёте значение.
2. Дописать в `DEPLOYMENT.md` раздел «Автодеплой через GitHub Actions» с описанием секретов, ручного запуска (`workflow_dispatch`) и rollback (переключить `WEB_ROOT` обратно на `.bak`).
3. Первый прогон запустите вручную через **Actions → Deploy Frontend → Run workflow** — по логам сразу увидим, работает ли SSH и правильный ли путь.

## Что подтвердить перед стартом

1. `WEB_ROOT` — либо пришлёте значение, либо подтвердите «оставь через secret, я сам добавлю».
2. Первую выкатку делаем **без `--delete**` (безопасно, могут остаться устаревшие файлы) → после успешной проверки переключаем на `--delete`. ОК?
3. Ветка для деплоя — `main`. Подтвердите (в Lovable-репо у нас `main`, но в вашем GitHub может быть другая ветка по умолчанию).