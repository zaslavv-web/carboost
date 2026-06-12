## GeoIP-блокировка Google для RU + Yandex ID

### 1. GeoIP-сервис на бэке (Laravel)

- Используем **MaxMind GeoLite2-Country** (бесплатная локальная БД, без внешних запросов на каждый логин). Пакет `geoip2/geoip2`. БД `GeoLite2-Country.mmdb` кладём в `backend-laravel/storage/app/geoip/`, путь конфигурируется через `GEOIP_DB_PATH`.
- Сервис `App\Services\GeoIpService`:
  - `countryFor(string $ip): ?string` — ISO-2 (`RU`, `US`, …). Возвращает `null` при ошибке/неизвестном IP.
  - Внутри: приоритет заголовка `CF-IPCountry` (если за Cloudflare) → затем MaxMind → fallback null.
  - Для локалхоста/private IP возвращает null (не считать «не-RU»).
- Helper `App\Support\ClientIp::resolve($request)` — берёт первый публичный IP из `X-Forwarded-For` (доверенные прокси настроены в `TrustProxies`).

### 2. Endpoint `/api/geo`

- `GET /api/geo` → `{ country: "RU" | "..." | null, providers: { google: bool, yandex: bool, email: bool } }`.
- Логика провайдеров: `google = country !== 'RU'`, `yandex = true`, `email = true`.
- Кэшируется на клиенте в `useQuery` (staleTime 10 мин).

### 3. Бэк-блокировка Google

- `GoogleAuthController@redirect`: если `GeoIpService::countryFor($ip) === 'RU'` → `abort(451, 'Google sign-in недоступен в вашем регионе. Используйте Yandex ID или email.')`.
- Тот же чек в `callback` на случай, если кто-то открыл прямую ссылку (защита от смены IP во время потока).

### 4. Yandex ID OAuth

- Бэк:
  - Контроллер `App\Http\Controllers\Auth\YandexAuthController` с `redirect` / `callback`. Используем нативный HTTP-клиент Laravel (без Socialite — он не имеет провайдера Yandex, ставим лёгкий вручную; либо `socialiteproviders/yandex`).
  - Endpoints: `GET /api/auth/yandex/redirect`, `GET /api/auth/yandex/callback`.
  - Конфиг `config/services.php` → `yandex.client_id / client_secret / redirect`.
  - Секреты: `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET` (запросим через secrets-tool отдельным шагом после одобрения плана) - сразу предоставим инструкцию как его получить
  - Возвращает токен Sanctum + создаёт/обновляет пользователя и `profile.full_name`, `avatar_url` (по полям Yandex API `default_email`, `real_name`, `display_name`, `default_avatar_id`).
  - В `/api/auth/config` добавляем статус Yandex (как уже сделано для Google) — для отладки.
- Фронт:
  - `laravelAuthApi.signInWithYandex(redirectTo?)` — по аналогии с `signInWithGoogle`.
  - `AuthContext.signInWithYandex`.
  - В `Login.tsx` кнопка «Войти через Yandex ID» (иконка через `/yandex.svg` в `public/`, либо inline SVG). Кнопка всегда видна; кнопка Google — только если `providers.google === true`.
  - i18n ключи: `auth.buttons.yandexSignIn / yandexSignUp`, `auth.errors.yandexFailed`, `auth.notices.googleBlockedRu` (тёплое объяснение под кнопками, когда Google скрыт).

### 5. Sync с локальным состоянием

- В коллбеке Yandex используем тот же механизм, что Google: редирект на фронт с `?token=...` и `localStorage` синк (соответствует памяти `Social Sync`).

### 6. Деплой и операционные шаги

- В README `backend-laravel/REVERB.md` / `DEPLOYMENT.md` добавить раздел «GeoIP»: скачать `GeoLite2-Country.mmdb` (cron auto-update через `geoipupdate` от MaxMind, требуется бесплатная учётка) и положить по пути `GEOIP_DB_PATH`.
- Указать в `.env.example`: `GEOIP_DB_PATH`, `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, `YANDEX_REDIRECT_URI`.
- В nginx/Trusted proxies — убедиться, что `X-Forwarded-For` прокидывается.

### 7. UI/UX детали

- Порядок кнопок: Yandex ID (брендовая красная), Google (если показан), затем разделитель и форма email/пароль.
- Когда Google скрыт по GeoIP — под блоком соцкнопок показываем небольшую заметку: «Вход через Google недоступен в вашем регионе».
- Загрузка `/api/geo` — пока идёт, обе соцкнопки в скелетоне (200мс), чтобы не было мигания.

### 8. Тесты/проверка

- Юнит-тест `GeoIpServiceTest` (моки на MaxMind reader): RU → 'RU', US → 'US', private IP → null.
- Ручная проверка:
  - VPN RU → нет Google, бэк отдаёт 451 на прямую ссылку.
  - VPN US → есть Google и Yandex.
  - Yandex flow: новый и существующий пользователь, корректная привязка `profiles`.

### Файлы

- new: `backend-laravel/app/Services/GeoIpService.php`, `backend-laravel/app/Support/ClientIp.php`,
`backend-laravel/app/Http/Controllers/Auth/YandexAuthController.php`,
`backend-laravel/app/Http/Controllers/Api/GeoController.php`.
- edit: `backend-laravel/config/services.php`, `backend-laravel/routes/api.php`,
`backend-laravel/app/Http/Controllers/Auth/GoogleAuthController.php`,
`backend-laravel/composer.json` (geoip2/geoip2).
- new: `src/integrations/laravel/geo.ts`, `src/hooks/useAuthProviders.ts`.
- edit: `src/integrations/laravel/auth.ts`, `src/contexts/AuthContext.tsx`, `src/pages/Login.tsx`,
`src/i18n/locales/{ru,en}/auth.json`, `public/yandex.svg`.

### Что потребуется от вас отдельно

1. После одобрения плана — добавлю секреты `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, и подскажу redirect URI, который нужно вписать в кабинет Yandex OAuth (`https://<домен>/api/auth/yandex/callback`).
2. На сервере положить `GeoLite2-Country.mmdb` в `storage/app/geoip/` (одноразовая операция; команду в инструкции).