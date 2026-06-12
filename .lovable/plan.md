## Что не так — две независимые причины

**1) Нет кнопки «Войти через Яндекс»**
В коде репозитория `src/pages/Login.tsx` кнопка Yandex есть и показывается, когда `/api/geo` отвечает `providers.yandex: true`. Сейчас `/api/geo` уже возвращает `"yandex": true`, но в браузере кнопки нет — значит на сервере в `/var/www/.../public` (или куда у вас раскатан фронт) лежит **старый билд React**, собранный ещё до добавления Yandex-кнопки. Поэтому никакая правка `.env` или бэка проблему №1 не решит — нужно пересобрать и выложить фронт.

**2) Google всё ещё виден с российского IP**
`/api/geo` отвечает `"country": null, "is_ru": false` → бэк не смог определить страну, поэтому Google не блокируется. Причина: в `backend-laravel/bootstrap/app.php` **не зарегистрирован middleware `TrustProxies**`, и в проекте нет файла `app/Http/Middleware/TrustProxies.php` (в `app/Http/Middleware/` лежат только `EffectiveUser`, `EnsureHasCompany`, `EnsureVerified`). Без него Laravel считает доверенным только сам себя, игнорирует `X-Forwarded-For` от nginx и в `request->ip()` отдаёт IP nginx-контейнера (`172.x.x.x` — приватный). В `GeoIpService` есть проверка `ClientIp::isPublic($ip)` → приватный IP отсекается → `countryFor` возвращает `null` → блокировка Google не срабатывает.

Дополнительно: вы напрямую без Cloudflare, поэтому `CF-IPCountry` тоже не приходит. Единственный источник страны — `ipapi.co` по реальному клиентскому IP, который сейчас до Laravel не доходит.

## План правок

### A. Доверять прокси (фикс GeoIP, проблема №2)

1. Создать `backend-laravel/app/Http/Middleware/TrustProxies.php`:
  - наследник `Illuminate\Http\Middleware\TrustProxies`,
  - `$proxies = '*'` (трастим всё — приемлемо, т.к. nginx и Laravel-контейнер в одной docker-сети),
  - `$headers = Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_HOST | Request::HEADER_X_FORWARDED_PORT | Request::HEADER_X_FORWARDED_PROTO`.
2. Подключить его в `backend-laravel/bootstrap/app.php` внутри `withMiddleware(...)`:
  ```php
   $middleware->trustProxies(at: '*', headers:
       \Illuminate\Http\Request::HEADER_X_FORWARDED_FOR
     | \Illuminate\Http\Request::HEADER_X_FORWARDED_HOST
     | \Illuminate\Http\Request::HEADER_X_FORWARDED_PORT
     | \Illuminate\Http\Request::HEADER_X_FORWARDED_PROTO,
   );
  ```
   (этого достаточно в Laravel 11 — отдельный класс middleware можно даже не создавать; оставим один из двух способов, чтобы было гарантированно).
3. В `deploy/nginx.conf` убедиться, что в `location /api` есть `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` и `proxy_set_header X-Real-IP $remote_addr;` (если уже есть — не трогаем).

### B. Привести `.env` на сервере в порядок (вы правите вручную в putty)

- Заполнить `YANDEX_CLIENT_ID` и `YANDEX_CLIENT_SECRET` реальными значениями из кабинета Яндекс ID — **без пробелов и кавычек**.
- Перепроверить, что у `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `YANDEX_CLIENT_SECRET` нет хвостовых пробелов после `=` (в выводе `tail` они есть — это валидно для dotenv, но безопаснее убрать).
- После правок:
  ```
  php artisan config:clear
  php artisan cache:clear
  php artisan config:cache
  ```

### C. Пересобрать и выложить фронт (фикс проблемы №1)

На вашей машине (или там, где собираете фронт):

```
git pull
npm ci          # или bun install
npm run build   # соберёт dist/
```

И залить содержимое `dist/` на сервер в каталог, который раздаёт nginx как корень фронта (тот же, где сейчас лежат старые `index.html` + `assets/*`). После заливки — `Ctrl+F5` в браузере, чтобы сбросить кэш.

### D. Проверка

После A+B+C на сервере выполнить:

```
curl -s https://growth-peak.pro/api/geo
curl -s https://growth-peak.pro/api/geo -H "X-Forwarded-For: 95.165.0.1"
```

Ожидаем:

- первый вызов с вашего реального IP → `"country":"RU","is_ru":true,"providers":{"email":true,"google":false,"yandex":true},"reason":"google_blocked_ru"`,
- второй (подделанный российский IP) → то же самое.

И на странице логина:

- с РФ-IP — видим только Email/пароль + красную кнопку «Войти через Яндекс», Google скрыт + появляется подпись `errors.googleBlockedRu`,
- с не-РФ IP / VPN — видим Email + Google + Яндекс.

## Технические детали (для разработчика)

- Файлы фронта менять **не нужно** — `Login.tsx`, `useAuthProviders`, `geo.ts` уже корректны. Достаточно пересобрать.
- В бэке трогаем только `bootstrap/app.php` (+ опционально новый `TrustProxies.php`). Логика `GeoIpService` и `ClientIp` корректна — она правильно отбрасывает приватные IP; именно поэтому видна проблема. После доверия прокси `request->ip()` сразу начнёт возвращать публичный IP клиента.
- Кэш Laravel: после изменения `bootstrap/app.php` обязательно `php artisan optimize:clear` (или связка `config:clear`+`route:clear`+`cache:clear`), иначе middleware не подхватится.
- Если после всех правок `country` всё ещё `null` — значит `ipapi.co` режется исходящим firewall сервера. Тогда переключаемся на `GEOIP_PROVIDER=ip-api` в `.env` (этот провайдер уже поддержан в `GeoIpService::lookupExternal`).  
  
Учти еще что на гите последнее обновление прошло 13 часов назад и прошло оно с ошибкой:  
Attempting to download 20...  

  Acquiring 20.20.2 - x64 from [https://github.com/actions/node-versions/releases/download/20.20.2-23521894959/node-20.20.2-linux-x64.tar.gz](https://github.com/actions/node-versions/releases/download/20.20.2-23521894959/node-20.20.2-linux-x64.tar.gz)  

  Extracting ...  

  /usr/bin/tar xz --strip 1 --warning=no-unknown-keyword --overwrite -C /home/runner/work/_temp/e04b1594-bbc2-4e96-8693-1b7ca5c7dafe -f /home/runner/work/_temp/db8bf77d-f878-465c-bd9f-73a72efa0d9a  

  Adding to the cache ...  

  Environment details  

  /opt/hostedtoolcache/node/20.20.2/x64/bin/npm config get cache  

  /home/runner/.npm  

  **Error:** Dependencies lock file is not found in /home/runner/work/carboost/carboost. Supported file patterns: package-lock.json,npm-shrinkwrap.json,yarn.lock