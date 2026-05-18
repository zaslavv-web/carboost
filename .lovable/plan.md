Причина ошибки: фронт использует Laravel Socialite (`/api/auth/google/redirect`), а в Google Console сейчас добавлен только Cloud callback `https://wwmdzrzguicinvxibbqv.supabase.co/auth/v1/callback`. Для текущего кода Google должен видеть Laravel callback.

Что нужно сделать вручную в Google Console:
1. Открыть тот же OAuth Client ID, который записан в GitHub Actions secret `GOOGLE_CLIENT_ID`.
2. В `Authorized JavaScript origins` оставить:
   - `https://growth-peak.pro`
   - `https://www.growth-peak.pro`
3. В `Authorized redirect URIs` добавить именно эти URI:
   - `https://growth-peak.pro/api/auth/google/callback`
   - `https://www.growth-peak.pro/api/auth/google/callback` если вход может стартовать с `www`.
4. URI `https://wwmdzrzguicinvxibbqv.supabase.co/auth/v1/callback` относится к другому OAuth-флоу и не помогает Laravel Socialite. Его можно оставить, но он не заменяет `/api/auth/google/callback`.
5. Проверить GitHub Actions secrets:
   - `APP_URL=https://growth-peak.pro`
   - `GOOGLE_REDIRECT_URI=https://growth-peak.pro/api/auth/google/callback`
   - `GOOGLE_CLIENT_ID` должен быть от того же OAuth Client, где добавлен callback выше.
6. Перезапустить GitHub Actions deploy, потому что `.env` на сервере создаётся из Actions secrets во время деплоя.

Если после этого останется mismatch, я добавлю диагностический временный endpoint/лог в Laravel, который покажет фактический `services.google.redirect`, не раскрывая client secret.