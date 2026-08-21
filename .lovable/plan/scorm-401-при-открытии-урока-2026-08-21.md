# SCORM: 401 при открытии урока

## Причина (подтверждено чтением кода)

Урок открывается через `<iframe src="/api/university/scorm/{course}/launch/{lesson}">` (`src/pages/CourseView.tsx`). Авторизация в приложении — bearer-токен Sanctum из localStorage, который подставляет только JS-клиент. Iframe и все вложенные запросы (`/scorm/asset/...`, `fetch(... credentials:'include')` внутри лаунчера) идут без заголовка `Authorization`, cookie-сессии нет — поэтому `ScormController::launch()` и `asset()` возвращают 401 на каждый урок.

## Решение: одноразовый тикет + короткоживущая cookie для SCORM-сессии

1. Новый endpoint (под обычной auth-мидлварой, вызывается фронтом с bearer-токеном):
   `POST /api/university/scorm/{courseId}/launch-ticket/{lessonId}`
   - выполняет те же проверки, что сейчас в `launch()` (курс SCORM, урок принадлежит курсу, enrollment либо права автора);
   - кладёт в кеш тикет (случайный 40-символьный ключ, TTL 60 с) с payload `user_id / course_id / lesson_id / enrollment_id / package_path`;
   - отдаёт `{ launch_url: "/api/university/scorm/launch/{ticket}" }`.

2. Новый публичный (без auth-мидлвары, защита — сам тикет) endpoint
   `GET /api/university/scorm/launch/{ticket}`:
   - разбирает тикет, при промахе — 410 с понятным текстом;
   - ставит HttpOnly + SameSite=Lax cookie `scorm_sess` (подписанный payload: user_id, package_path, enrollment_id, exp = +4 ч), путь `/api/university/scorm`;
   - отдаёт тот же HTML-лаунчер, что и сейчас (`launchHtml`), без изменений в SCORM API-адаптере.

3. `asset()`, `storeCmi()`, `getCmi()` получают резервную аутентификацию: если bearer-пользователя нет, читается и валидируется cookie `scorm_sess`; проверки принадлежности пакета/enrollment остаются как есть, только `uid` берётся из cookie. Прямые запросы без cookie и без токена по-прежнему 401.

4. Существующий маршрут `GET /university/scorm/{courseId}/launch/{lessonId}` остаётся (для bearer-вызовов и обратной совместимости), но фронт им больше не пользуется.

5. Фронт (`CourseView.tsx`): при выборе SCORM-урока запрашивать тикет через `laravel.post`, показывать скелет во время запроса, затем iframe с полученным `launch_url`. Ошибки — читаемые сообщения: 403 «Курс вам не назначен», 404 «Материал не найден», 410 «Ссылка устарела, откройте урок заново» с кнопкой повторить.

## Технические детали

- Файлы: `backend-laravel/app/Http/Controllers/Api/ScormController.php`, `backend-laravel/routes/api.php`, `src/pages/CourseView.tsx`.
- Cookie подписывается через `Illuminate\Support\Facades\Crypt`/`hash_hmac` с `APP_KEY`; никаких новых таблиц и миграций не требуется.
- Тикет хранится в кеше (`Cache::put`, TTL 60 с), одноразовый — удаляется после успешного запуска.
- Публичный маршрут `launch/{ticket}` регистрируется вне группы `auth:sanctum`, но внутри `api`-мидлвары; в него не попадают никакие данные без валидного тикета.
- Тесты в `backend-laravel/tests/Feature/ScormControllerTest.php`: тикет создаётся для записанного пользователя, 403 для неписанного, запуск по тикету отдаёт HTML и cookie, ассет доступен с cookie и 401 без неё, повторное использование тикета — 410.

## После реализации

Нужен `git pull` + очистка кешей на бою; ранее загруженные курсы перезаливать не потребуется.
