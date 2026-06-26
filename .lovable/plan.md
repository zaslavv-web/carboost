## Полная замена `.env` на VPS

Готовлю единый блок `.env` на основе вашего git-шаблона, но адаптированный под shared-хостинг (без Docker/Redis, MySQL вместо Postgres, Unisender Go вместо SMTP Яндекса) и с подставленными значениями, которые уже были у вас в рабочей версии.

---

### 1. Итоговое содержимое `.env`

Сохранить дословно в `~/growth-peak.pro/docs/backend/.env`:

```env
APP_NAME="Пик Роста"
APP_ENV=production
APP_KEY=
APP_CIPHER=aes-256-cbc
APP_DEBUG=false
APP_URL=https://growth-peak.pro
APP_TIMEZONE=UTC
APP_LOCALE=ru

LOG_CHANNEL=stack
LOG_LEVEL=info

# --- Database (shared hosting MySQL) ---
DB_CONNECTION=mysql
DB_HOST=gro7659365.mysql
DB_PORT=3306
DB_DATABASE=gro7659365_d
DB_USERNAME=gro7659365_grow
DB_PASSWORD=ВСТАВИТЬ_ПАРОЛЬ_БД

# --- Cache / Queue / Session (file-based, без Redis) ---
CACHE_STORE=file
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
FILESYSTEM_DISK=local

# --- Sanctum ---
SANCTUM_STATEFUL_DOMAINS=growth-peak.pro,www.growth-peak.pro,localhost:8080
SESSION_DOMAIN=.growth-peak.pro

# --- Frontend ---
FRONTEND_URL=https://growth-peak.pro
APP_FRONTEND_URL=https://growth-peak.pro

# --- Google OAuth ---
GOOGLE_CLIENT_ID=82821983974-p9i8bcablgclmk5ql253i9oia2pfie03.apps.googleusercontent.com
а это откуда взято? у нас в secrets на гите нет этих данных
GOOGLE_CLIENT_SECRET=ВСТАВИТЬ_GOOGLE_SECRET - в гите нет данных, в старом (работавшем до приключений с ник.ру) тоже нет - откуда взять?
GOOGLE_REDIRECT_URI=https://growth-peak.pro/api/auth/google/callback

# --- Yandex OAuth ---
YANDEX_CLIENT_ID=ВСТАВИТЬ_YANDEX_ID
YANDEX_CLIENT_SECRET=ВСТАВИТЬ_YANDEX_SECRET
YANDEX_REDIRECT_URI=https://growth-peak.pro/api/auth/yandex/callback
вот здесь вообще не понятно откуда брать инфо?

# --- Mail: Unisender Go (HTTP API, шард go2) ---
MAIL_MAILER=unisender_go
MAIL_FROM_ADDRESS=noreply@mail.growth-peak.pro
MAIL_FROM_NAME="Пик Роста"
UNISENDER_GO_API_KEY=ВСТАВИТЬ_API_КЛЮЧ_UNISENDER
UNISENDER_GO_ENDPOINT=https://go2.unisender.ru/ru/transactional/api/v1/email/send.json

# --- AI Gateway ---
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_API_KEY=
AI_MODEL=gpt-4o-mini

# --- GeoIP ---
GEOIP_PROVIDER=ip-api
GEOIP_DISABLED=0
```

Четыре плейсхолдера, которые надо заменить руками:

- `ВСТАВИТЬ_ПАРОЛЬ_БД` — пароль MySQL `gro7659365_d` (у хостера в панели).
- `ВСТАВИТЬ_GOOGLE_SECRET` — Client Secret из Google Cloud Console.
- `ВСТАВИТЬ_YANDEX_ID` / `ВСТАВИТЬ_YANDEX_SECRET` — из кабинета Яндекс OAuth (если Яндекс-логин не используете — можно оставить пустыми).
- `ВСТАВИТЬ_API_КЛЮЧ_UNISENDER` — ваш ключ Unisender Go (40 симв.).

`APP_KEY` оставлен пустым намеренно — сгенерируем командой ниже (брать ключ из git-шаблона нельзя, он публичный и сломает все старые шифрованные данные/сессии всё равно — лучше сгенерировать свой).

---

### 2. Порядок действий на VPS

```bash
cd ~/growth-peak.pro/docs/backend

# 2.1. Бэкап текущего огрызка
cp .env .env.bak.$(date +%s)

# 2.2. Создать новый .env
nano .env
# → вставить весь блок выше целиком, сохранить (Ctrl+O, Enter, Ctrl+X)

# 2.3. Подставить 4 секрета
nano .env
# → заменить 4 плейсхолдера ВСТАВИТЬ_*

# 2.4. Сгенерировать APP_KEY
php artisan key:generate --force

# 2.5. Сбросить кеш конфигурации
php artisan config:clear
php artisan cache:clear

# 2.6. Проверки
php artisan smtp:status
# ожидаем: MAIL_MAILER=unisender_go, endpoint=go2..., API key есть (40 симв.)

php artisan unisender:test zaslavv@yandex.ru
# ожидаем: успех + письмо в ящике
```

---

### 3. Что меняется по сравнению с git-шаблоном и почему


| Блок                | git-шаблон                | На VPS                            | Причина                                                                            |
| ------------------- | ------------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| DB                  | `pgsql` + `postgres:5432` | `mysql` + `gro7659365.mysql:3306` | На shared-хостинге Postgres нет, есть только MySQL                                 |
| Cache/Queue/Session | `redis`                   | `file` / `sync` / `file`          | Redis недоступен (отсюда был `getaddrinfo for redis failed`)                       |
| Mail                | `smtp.yandex.ru`          | Unisender Go API (`go2`)          | SMTP Яндекса возвращает 535 даже с app-password; Unisender уже подключён и оплачен |
| `APP_KEY`           | хардкод из шаблона        | генерируется `key:generate`       | Публичный ключ из репо использовать нельзя                                         |
| `YANDEX_*`          | отсутствовало             | добавлено                         | Нужно для Яндекс-логина (если используется)                                        |


Код приложения для Unisender Go (`UnisenderGoTransport.php`, `config/mail.php`, `AppServiceProvider`, `EmailConfigService`, команды `smtp:status` / `unisender:test`) уже в репозитории — менять/писать ничего не надо, нужен только корректный `.env` + `git pull` если ещё не подтягивали последние правки.

---

### 4. Чего не делаем

- Не копируем `APP_KEY` из git-шаблона.
- Не возвращаем `MAIL_HOST=smtp.yandex.ru` / `MAIL_PASSWORD=...` — при `MAIL_MAILER=unisender_go` эти поля игнорируются и только путают диагностику.
- Не включаем Redis-переменные — они вернут ошибку `getaddrinfo for redis failed`.
- Не используем `php artisan config:cache` на shared-хостинге без необходимости — после `config:clear` приложение будет читать `.env` напрямую, что упрощает отладку.