## Проблема

`git pull` в `~/backend/backend-laravel` обновил исходники, но `php artisan` в этой папке не работает — значит рабочее Laravel-приложение развёрнуто в другом каталоге (типичная схема: git-репо отдельно, а на веб-сервере лежит либо копия, либо symlink на `public/`, либо отдельный чекаут через deploy-скрипт).

Нужно сначала найти реальный `artisan` на сервере, а потом выполнить миграцию и очистку кэшей уже оттуда.

## Что сделать на сервере (по шагам)

### 1) Найти все `artisan` и определить рабочую папку

```bash
# из домашней директории
cd ~
ls -la
find ~ -maxdepth 4 -name artisan -not -path "*/vendor/*" 2>/dev/null
# на всякий случай — общесистемно
find / -maxdepth 6 -name artisan -not -path "*/vendor/*" 2>/dev/null | head

[gro7659365@gro7659365 ~]$ cd ~
[gro7659365@gro7659365 ~]$ ls -la
total 84
drwx------. 15 gro7659365 gro7659365  4096 июл 14 04:04 .
drwxr-xr-x.  3 root       root          32 апр 30 13:09 ..
-rw-rw-r--.  1 gro7659365 gro7659365    45 июн 25 22:31 backend.backup.20260625-223114.tar.gz
-rw-rw-r--.  1 gro7659365 gro7659365    45 июн 25 22:31 backend.backup.20260625-223143.tar.gz
-rw-------.  1 gro7659365 gro7659365 69495 июл 14 04:04 .bash_history
drwxrwxr-x.  3 gro7659365 gro7659365    30 июн  6 18:01 .cache
drwxrwxr-x.  3 gro7659365 gro7659365    48 июн  6 18:07 .composer
drwxrwxr-x.  4 gro7659365 gro7659365    47 июн  8 11:04 .config
drwxr-xr-x.  4 gro7659365 gro7659365    44 июн  6 02:32 etc
-rw-rw-r--.  1 gro7659365 gro7659365    54 июн  7 01:41 .gitconfig
drwx------.  3 gro7659365 gro7659365    62 июн 20 23:23 .gnupg
drwxr-xr-x.  5 gro7659365 gro7659365    62 мая 19 21:25 growth-peak.pro
drwxr-xr-x.  5 gro7659365 gro7659365    62 апр 30 13:09 growthpeak.pro
drwxrwxr-x.  3 gro7659365 gro7659365    27 июн  6 18:01 .local
drwxr-xr-x.  5 gro7659365 gro7659365    62 мая 20 13:38 semenduev.pro
drwxrwxr-x.  2 gro7659365 gro7659365    10 июн 25 22:29 server-local-changes
drwx------.  2 gro7659365 gro7659365   148 июн  9 02:55 .ssh
drwxrwxr-x.  3 gro7659365 gro7659365    85 июн  6 18:01 .subversion
drwxr-xr-x.  2 gro7659365 gro7659365    10 апр 30 13:09 tmp
[gro7659365@gro7659365 ~]$ find ~ -maxdepth 4 -name artisan -not -path "*/vendor/*" 2>/dev/null
/home/gro7659365/growth-peak.pro/docs/backend/artisan
[gro7659365@gro7659365 ~]$ # на всякий случай — общесистемно
[gro7659365@gro7659365 ~]$ find / -maxdepth 6 -name artisan -not -path "*/vendor/*" 2>/dev/null | head
/home/gro7659365/growth-peak.pro/docs/backend/artisan

```

Также проверь, куда указывает документ-рут веб-сервера — рядом с ним и лежит `public/` Laravel:

```bash
# nginx
grep -R "root " /etc/nginx/ 2>/dev/null | grep -v "#"
# apache
grep -R "DocumentRoot" /etc/httpd/ /etc/apache2/ 2>/dev/null | grep -v "#"
# или посмотри симлинк public
ls -la /var/www/ 2>/dev/null
ls -la ~/public_html 2>/dev/null
readlink -f ~/public_html 2>/dev/null

[gro7659365@gro7659365 ~]$ grep -R "root " /etc/nginx/ 2>/dev/null | grep -v "#"
/etc/nginx/conf.d/0.conf:        root                       /usr/share/webpages/nosites/;
/etc/nginx/conf.d/growth-peak.pro.conf:        root                       /home/gro7659365/growth-peak.pro/docs;
/etc/nginx/conf.d/www.growth-peak.pro.conf:        root                       /home/gro7659365/growth-peak.pro/docs;
/etc/nginx/conf.d/semenduev.pro.conf:        root                       /home/gro7659365/semenduev.pro/docs;
/etc/nginx/conf.d/www.semenduev.pro.conf:        root                       /home/gro7659365/semenduev.pro/docs;
/etc/nginx/conf.auto.d/freeze.conf:            root                  /usr/share/webpages/freeze/;
/etc/nginx/conf.auto.d/growth-peak.pro.conf:        root                       /home/gro7659365/growth-peak.pro/docs;
/etc/nginx/conf.auto.d/www.growth-peak.pro.conf:        root                       /home/gro7659365/growth-peak.pro/docs;
/etc/nginx/conf.auto.d/semenduev.pro.conf:        root                       /home/gro7659365/semenduev.pro/docs;
/etc/nginx/conf.auto.d/www.semenduev.pro.conf:        root                       /home/gro7659365/semenduev.pro/docs;
[gro7659365@gro7659365 ~]$ # apache
[gro7659365@gro7659365 ~]$ grep -R "DocumentRoot" /etc/httpd/ /etc/apache2/ 2>/dev/null | grep -v "#"
/etc/httpd/conf.php74.d/vhosts/0.conf:    DocumentRoot /home/gro7659365/growth-peak.pro/docs
/etc/httpd/conf.php74.d/vhosts/0.conf:        DocumentRoot /home/gro7659365/growth-peak.pro/docs/public
/etc/httpd/conf.php74.d/vhosts/growth-peak.pro.conf:    DocumentRoot /home/gro7659365/growth-peak.pro/docs
/etc/httpd/conf.php74.d/vhosts/growth-peak.pro.conf:        DocumentRoot /home/gro7659365/growth-peak.pro/docs/public
/etc/httpd/conf.php74.auto.d/growth-peak.pro.conf:    DocumentRoot /home/gro7659365/growth-peak.pro/docs
/etc/httpd/conf.php74.auto.d/growth-peak.pro.conf:        DocumentRoot /home/gro7659365/growth-peak.pro/docs/public
/etc/httpd/conf.php82.d/vhosts/0.conf:    DocumentRoot /home/gro7659365/growth-peak.pro/docs
/etc/httpd/conf.php82.d/vhosts/0.conf:        DocumentRoot /home/gro7659365/growth-peak.pro/docs/public
/etc/httpd/conf.php82.d/vhosts/growth-peak.pro.conf:    DocumentRoot /home/gro7659365/growth-peak.pro/docs
/etc/httpd/conf.php82.d/vhosts/growth-peak.pro.conf:        DocumentRoot /home/gro7659365/growth-peak.pro/docs/public
/etc/httpd/conf.php82.d/vhosts/semenduev.pro.conf:    DocumentRoot /home/gro7659365/semenduev.pro/docs
/etc/httpd/conf.php82.d/vhosts/semenduev.pro.conf:        DocumentRoot /home/gro7659365/semenduev.pro/docs/public
/etc/httpd/conf.php82.auto.d/growth-peak.pro.conf:    DocumentRoot /home/gro7659365/growth-peak.pro/docs
/etc/httpd/conf.php82.auto.d/growth-peak.pro.conf:        DocumentRoot /home/gro7659365/growth-peak.pro/docs/public
/etc/httpd/conf.php82.auto.d/semenduev.pro.conf:    DocumentRoot /home/gro7659365/semenduev.pro/docs
/etc/httpd/conf.php82.auto.d/semenduev.pro.conf:        DocumentRoot /home/gro7659365/semenduev.pro/docs/public
[gro7659365@gro7659365 ~]$ # или посмотри симлинк public
[gro7659365@gro7659365 ~]$ ls -la /var/www/ 2>/dev/null
total 4
drwxr-xr-x.  4 nobody nobody   33 июн 17 21:26 .
drwxr-xr-x. 20 nobody nobody 4096 июн 17 21:26 ..
drwxr-xr-x.  2 nobody nobody    6 июн 17 10:58 cgi-bin
drwxr-xr-x.  2 nobody nobody    6 июн 17 10:58 html
[gro7659365@gro7659365 ~]$ ls -la ~/public_html 2>/dev/null
[gro7659365@gro7659365 ~]$ readlink -f ~/public_html 2>/dev/null
/home/gro7659365/public_html

```

Ожидаемо найдётся один из вариантов:

- `~/backend/artisan` (репо в `backend-laravel/`, а деплой в `~/backend/`)
- `/var/www/growth-peak/artisan` или `/var/www/html/artisan`
- `~/domains/growth-peak.pro/public_html/../artisan`
- отдельный клон, обновляемый скриптом `deploy/deploy-laravel.sh`

### 2) Проверить, применились ли туда наши изменения

Как только нашёл путь `APP_DIR` c `artisan`:

```bash
cd <APP_DIR>
git log --oneline -5                 # если это git-чекаут — должен быть 869f1de
ls app/Http/Controllers/Api/RpcController.php
grep -n 'requestedRole' app/Http/Controllers/Api/RpcController.php
ls database/migrations/ | grep 0030_00_04
```

Если это НЕ git-репо (deploy копирует файлы) — значит нужно запустить существующий deploy-скрипт:

```bash
ls ~/backend/deploy/
cat ~/backend/deploy/deploy-laravel.sh   # посмотреть, что он делает
bash ~/backend/deploy/deploy-laravel.sh  # выполнить (если он предназначен для этого)
```

### 3) Прогнать миграцию и сбросить кэши в правильной папке

```bash
cd <APP_DIR>
php artisan migrate:status | tail -15
php artisan migrate --force
php artisan config:clear
php artisan config:cache
php artisan route:cache
php artisan queue:restart
```

Если PHP на сервере запускается не как `php`, а как `php8.2` / `/opt/php82/bin/php` — используем его же (обычно виден в `which php` или `php -v`).

### 4) Проверить, что фикс работает

- Перезайти в HRD-панель на `growth-peak.pro`
- Попробовать массовое приглашение
- Смотрим в `storage/logs/laravel.log` — не должно быть `Undefined array key "requested_role"` и `SQLSTATE 1364 created_by`

## Что нужно от тебя

Выполни блок из шага 1 и пришли вывод — по нему я скажу точный путь и следующую команду. Дальше пройдём по шагам 2–4.

## Замечание

Мы всё ещё чиним последствия: PeopleAnalytics использует `to_char(::date)` (Postgres), а прод на MySQL — этот эндпоинт продолжит падать до отдельного фикса. Разберёмся после того, как заработает bulk-invite и HR-документы.