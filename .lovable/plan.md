# План: навести порядок на сервере и починить SMTP

## Что мы знаем

- Рабочий домен — **growth-peak.pro** (с дефисом).
- Вы запускали artisan из `~/backend` — это **не настоящий Laravel проекта**, а сторонний «огрызок» с битым git (1 локальный коммит, 1651 отставание от origin, тысячи untracked-файлов). Именно из него тянулся «не тот» `.env` с 10-символьным паролем.
- Параллельно есть `~/growthpeak.pro/` (без дефиса) — старая копия / мусор.
- `~/server-local-changes/` — пустая (поэтому `diff` падает с "No such file or directory").
- Настоящий код приложения живёт в репозитории в папке `backend-laravel/`.

Никаких изменений в исходниках проекта по этому плану не требуется. Это операционная зачистка сервера + один правильный деплой.

## Цели

1. Один-единственный каталог Laravel на сервере = свежий клон репозитория, путь `~/growth-peak.pro/app/` (см. ниже).
2. Один-единственный `.env` живёт **только на сервере**, не в git.
3. Все мусорные/дублирующие папки удалены после бэкапа.
4. SMTP читает реальный 16-символьный пароль и тест-письмо уходит.

## Шаги (выполняются на сервере по SSH)

### Шаг 1. Диагностика — куда смотрит nginx/Apache

Понять, какая папка реально отдаёт сайт `growth-peak.pro`:

```bash
# для shared-хостинга nichost обычно так:
ls -la ~/growth-peak.pro/
cat ~/growth-peak.pro/.htaccess 2>/dev/null | head -20
# найдём, где DocumentRoot
grep -rEn "DocumentRoot|root " /etc/nginx/ /etc/apache2/ /etc/httpd/ 2>/dev/null | grep -i peak
```

Результат пришлите — он определит финальный путь (`~/growth-peak.pro/public_html`, `~/growth-peak.pro/app/public`, и т.п.).

### Шаг 2. Полный бэкап перед любыми удалениями

```bash
cd ~
tar -czf full-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
  backend growthpeak.pro growth-peak.pro server-local-changes 2>/dev/null
ls -lh full-backup-*.tar.gz
```

И отдельно сохранить текущий `.env` из `~/backend`:

```bash
cp ~/backend/.env ~/env-backup-from-backend-$(date +%Y%m%d-%H%M%S).txt
```

### Шаг 3. Свежий клон рабочего репозитория

```bash
cd ~/growth-peak.pro
git clone <URL_РЕПОЗИТОРИЯ> app
cd app/backend-laravel
composer install --no-dev --optimize-autoloader
```

URL репозитория подскажете (ссылка вида `git@github.com:.../....git` или `https://...`).

### Шаг 4. Положить правильный `.env` в новый клон

```bash
cd ~/growth-peak.pro/app/backend-laravel
cp .env.example .env
nano .env   # вписать APP_KEY, DB_*, MAIL_*
```

Пароль приложения Яндекса вписать без кавычек и без пробелов через безопасный ввод (не светим в history):

```bash
sed -i '/^SMTP_PASSWORD=/d;/^MAIL_PASSWORD=/d' .env
printf 'SMTP_PASSWORD=' >> .env && read -rs PW && printf '%s\n' "$PW" >> .env
printf 'MAIL_PASSWORD=' >> .env && printf '%s\n' "$PW" >> .env
unset PW
chmod 600 .env
```

Затем:

```bash
php artisan key:generate   # только если APP_KEY пустой
php artisan optimize:clear
php artisan smtp:where     # должна показать backend-laravel/.env из НОВОГО пути
php artisan smtp:env-doctor
php artisan smtp:test growthpeak@yandex.ru
```

Ожидаемо: `raw length: 16`, `parsed length: 16`, письмо приходит.

### Шаг 5. Переключить веб-сервер на новый путь

Если DocumentRoot указывал на `~/growth-peak.pro/public_html` — заменить эту папку симлинком на новый `public`:

```bash
mv ~/growth-peak.pro/public_html ~/growth-peak.pro/public_html.old
ln -s ~/growth-peak.pro/app/backend-laravel/public ~/growth-peak.pro/public_html
```

(Точная команда зависит от вывода Шага 1 — поэтому сначала диагностика.)

Проверить, что сайт открывается, что вход/регистрация работают, что заявка на демо уходит.

### Шаг 6. Удалить мусор после успешной проверки

Только после того, как сайт стабильно работает с нового клона **минимум сутки**:

```bash
rm -rf ~/backend
rm -rf ~/growthpeak.pro            # старый домен без дефиса, если он не нужен
rm -rf ~/server-local-changes
rm -rf ~/growth-peak.pro/public_html.old
```

Бэкап `full-backup-*.tar.gz` оставить ещё на месяц.

### Шаг 7. Закрыть утечку пароля из git

Сейчас `backend-laravel/.env` лежит **внутри git-репозитория** — пароль приложения Яндекса фактически в истории. После того как почта заработает:

1. Отозвать текущий пароль приложения в Яндекс ID.
2. Сгенерировать новый, обновить только серверный `.env`.
3. В репозитории: добавить `backend-laravel/.env` в `.gitignore`, удалить файл из текущего коммита, при необходимости почистить историю через `git filter-repo`. Это уже отдельная задача в коде проекта — оформим следующим планом, когда закроем операционную часть.

## Что нужно от вас перед запуском плана

1. Вывод команд из Шага 1 (куда смотрит веб-сервер для `growth-peak.pro`).
2. URL git-репозитория для клонирования.
3. Подтверждение, что `growthpeak.pro` без дефиса можно удалять.
