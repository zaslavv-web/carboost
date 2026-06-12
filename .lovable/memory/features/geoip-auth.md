---
name: GeoIP Auth Restrictions
description: RU users see Yandex ID + email/password only (Google hidden + blocked on backend); /api/geo drives the UI
type: feature
---
- Backend `GeoIpService` resolves country via `CF-IPCountry` header first, then `https://ipapi.co/{ip}/country/` (cached 24h). Disable with env `GEOIP_DISABLED=1`.
- `GET /api/geo` → `{ country, is_ru, providers: { email, google, yandex }, reason }`. Google flag is `false` for RU; Yandex flag depends on configured `YANDEX_CLIENT_ID`/`SECRET`.
- `GoogleAuthController` rejects with `#error=...` redirect when GeoIP says RU (checked in both `redirect` and `callback`).
- Yandex ID OAuth: `YandexAuthController` (`/api/auth/yandex/redirect|callback`), no Socialite — direct HTTP to `oauth.yandex.ru` + `login.yandex.ru/info`. `AuthUserService.findOrCreateFromYandex` mirrors Google flow, stores `yandex_id` in meta.
- Frontend: `useAuthProviders()` hook + `/integrations/laravel/geo.ts`. `Login.tsx` renders Yandex button (red `#FC3F1D`) always when configured, hides Google for RU and shows `errors.googleBlockedRu` notice.
- Required env: `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, optional `YANDEX_REDIRECT_URI`. Redirect URI in Yandex OAuth console: `https://<domain>/api/auth/yandex/callback`.
