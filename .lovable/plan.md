Нашёл две вероятные причины текущей проблемы с почтой:

1. На backend сейчас настроен SMTP `smtp.yandex.com:465`, но для Яндекс.Почты обычно нужен `smtp.yandex.ru` и для порта `465` — шифрование `ssl`. В текущей CI-конфигурации шифрование по умолчанию остаётся `tls`, если secret `MAIL_ENCRYPTION` не задан.
2. `/api/health` в production возвращает `503` из-за проверки Redis: `Class "Redis" not found`. При этом workflow уже деплоит backend с `CACHE_STORE=file`, `QUEUE_CONNECTION=sync`, `SESSION_DRIVER=file`, то есть Redis не должен быть обязательным. Этот 503 может вводить nginx/monitoring/фронт в состояние “backend недоступен”, хотя DB работает.

План исправления:

1. Сделать health-check честным для текущего Laravel backend
   - Убрать обязательную Redis-проверку из `/api/health`, если cache/session/queue не используют Redis.
   - Оставить обязательными только `api` и `db`.
   - Добавить безопасную диагностику `cache/session/queue`, чтобы видеть режимы без падения health-check.

2. Защитить SMTP-конфигурацию от неправильных сочетаний host/port/encryption
   - В `.github/workflows/npm-publish.yml` нормализовать Яндекс SMTP:
     - если host задан как `smtp.yandex.com`, заменить на `smtp.yandex.ru`;
     - если порт `465` и encryption не задан, ставить `ssl`;
     - если порт `587` и encryption не задан, ставить `tls`.
   - Не трогать секреты и не выводить их в логи.

3. Устранить расхождение между runtime SMTP и восстановлением пароля
   - В `PasswordResetController` оставить применение runtime SMTP перед отправкой.
   - В `Admin\UsersController` добавить такое же применение SMTP перед `Password::sendResetLink`, чтобы приглашения/сбросы от админа использовали актуальные настройки.

4. Улучшить диагностику почты без раскрытия секретов
   - В `/api/diag` показывать `encryption`, `from`, `username: set/missing`, `host`, `port`.
   - Добавить локализацию типичных SMTP-ошибок восстановления пароля: неверный пароль приложения, неправильный host/port/encryption, rejected sender.

5. Проверка после правок
   - Проверить PHP-синтаксис изменённых backend-файлов.
   - После деплоя проверить:
     - `https://growth-peak.pro/api/health` должен вернуть `200`;
     - `https://growth-peak.pro/api/diag` должен показать `smtp.yandex.ru`, `465`, `ssl`, `username: set`;
     - кнопка “Забыли пароль?” должна либо отправить письмо, либо вернуть точную русскую причину ошибки SMTP.

Важно: в Lovable Cloud email-доменов сейчас не настроено, но опубликованный сайт `growth-peak.pro` использует внешний Laravel backend и SMTP из GitHub secrets, поэтому чинить нужно именно Laravel/CI-конфигурацию, а не Cloud-почту.