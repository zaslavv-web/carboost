«Ничего не произошло» — это нормально: `sed`, `cat >> .env`, `grep` не печатают вывод при успехе. Они молча отредактировали файл. Давайте проверим результат и вставим ключ.

## Шаг 1. Убедиться, что строки реально добавились

В папке `~/growth-peak.pro/docs/backend`:

```bash
grep -E '^(MAIL_MAILER|MAIL_FROM_ADDRESS|MAIL_FROM_NAME|UNISENDER_GO_API_KEY|CACHE_STORE|QUEUE_CONNECTION|SESSION_DRIVER)=' .env

вывод
CACHE_STORE="file"
QUEUE_CONNECTION="sync"
SESSION_DRIVER="file"
MAIL_MAILER="unisender_go"
MAIL_FROM_ADDRESS="growthpeak@yandex.ru"
MAIL_FROM_NAME="Пик роста"

```

&nbsp;

Должно вывести 7 строк, включая:

```
MAIL_MAILER=unisender_go
UNISENDER_GO_API_KEY=ВСТАВЬТЕ_СЮДА_КЛЮЧ_ИЗ_КАБИНЕТА_UNISENDER
```

## Шаг 2. Заменить плейсхолдер на реальный ключ

`nano .env` — это команда, которая **открывает текстовый редактор прямо в терминале**. Куда «открывать» не нужно — он развернётся на весь экран SSH-сессии. Внутри:

1. Стрелками ↓ доскрольте до строки `UNISENDER_GO_API_KEY=ВСТАВЬТЕ_СЮДА...`
2. Удалите `ВСТАВЬТЕ_СЮДА_КЛЮЧ_ИЗ_КАБИНЕТА_UNISENDER` и вставьте настоящий ключ из кабинета Unisender Go (правая кнопка мыши → Paste, или Shift+Insert).
3. `Ctrl+O`, затем `Enter` — сохранить.
4. `Ctrl+X` — выйти.

Если `nano` не установлен (`command not found`) — используйте `vi .env` (там: `i` для редактирования, `Esc` → `:wq` → `Enter` чтобы сохранить) или одной командой без редактора:

```bash
sed -i 's|^UNISENDER_GO_API_KEY=.*|UNISENDER_GO_API_KEY=ВАШ_РЕАЛЬНЫЙ_КЛЮЧ|' .env
```

(подставив реальный ключ вместо `ВАШ_РЕАЛЬНЫЙ_КЛЮЧ`).

## Шаг 3. Применить и протестировать

```bash
php artisan config:clear && php artisan config:cache
php artisan smtp:status
php artisan unisender:test ваш@email
```

Пришлите вывод `smtp:status` и `unisender:test` — по ним сразу видно, ушло письмо или нет.

Изменения в коде проекта не требуются. Подтвердите план, и я переключусь в build-режим, если потребуется что-то поправить на стороне приложения.