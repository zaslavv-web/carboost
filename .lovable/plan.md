## Вывод по ошибке

`535 5.7.8 authentication failed: Invalid user or password` означает, что соединение с Яндекс SMTP есть, хост/порт/шифрование корректные, но Яндекс не принимает пару `growthpeak@yandex.ru` + пароль.

Это не ошибка кода и не ошибка формы на сайте. Сейчас нужно заменить пароль в `.env` на новый пароль приложения Яндекса.

## План действий

1. **Создать новый пароль приложения в Яндекс ID**
  - Открыть Яндекс ID для аккаунта `growthpeak@yandex.ru`.
  - Перейти в безопасность → пароли приложений.
  - Создать пароль для почты / IMAP / SMTP.
  - Скопировать именно пароль приложения, не обычный пароль от Яндекс-аккаунта.
2. **Обновить `.env` на сервере**
  Проверить, чтобы были заданы одинаковые актуальные значения:
   Если пароль содержит спецсимволы, лучше взять его в двойные кавычки.
3. **Очистить кэш Laravel**
  ```text
   php artisan optimize:clear
  ```
4. **Проверить, что приложение видит новый пароль**
  ```text
   php artisan smtp:status
  ```
   Ожидаем:
  - источник: `.env`
  - username: `growthpeak@yandex.ru`
  - password: присутствует / длина больше нуля
  - host: `smtp.yandex.ru`
  - port: `465`
  - encryption: `ssl`
5. **Повторить тестовую отправку**
  ```text
   php artisan smtp:test growthpeak@yandex.ru
  ```
6. **Если снова будет 535**
  Тогда проблема на стороне доступа Яндекса:
  - пароль приложения создан не для этого аккаунта;
  - скопирован не полностью;
  - в `.env` остался старый пароль;
  - после правки не выполнен `php artisan optimize:clear`;
  - у ящика отключён доступ почтовых клиентов / SMTP.
7. **Если письмо уйдёт успешно**
  После этого проверяем форму заявки на демо на сайте и отдельно восстанавливаем доступ суперадмина через:

## Что прислать мне после замены пароля

- вывод `php artisan smtp:status`;  
=== SMTP STATUS ===
  Активный источник : .env (приоритет)
  --- .env ---
  MAIL_HOST         : [smtp.yandex.ru](http://smtp.yandex.ru)
  MAIL_PORT         : 465
  MAIL_ENCRYPTION   : ssl
  MAIL_USERNAME     : [growthpeak@yandex.ru](mailto:growthpeak@yandex.ru)
  MAIL_PASSWORD     : есть (10 симв.)
  MAIL_FROM_ADDRESS : [growthpeak@yandex.ru](mailto:growthpeak@yandex.ru)
  MAIL_FROM_NAME    : Пик роста
  SALES_NOTIFICATION_EMAIL : (пусто)
  --- email_settings (БД) ---
  активная запись : отсутствует
  --- эффективная конфигурация Laravel ---
  host        : [smtp.yandex.ru](http://smtp.yandex.ru)
  port        : 465
  encryption  : ssl
  username    : [growthpeak@yandex.ru](mailto:growthpeak@yandex.ru)
  &nbsp;
- вывод `php artisan smtp:test growthpeak@yandex.ru`;  

  Использую: smtp.yandex.ru:465 (ssl) как [growthpeak@yandex.ru](mailto:growthpeak@yandex.ru)
  Отправка не удалась: Connection could not be established with host "ssl://smtp.yandex.ru:465": stream_socket_client(): Unable to connect to ssl://smtp.yandex.ru:465 (Connection timed out)
  &nbsp;
- пришло ли письмо во входящие или спам.