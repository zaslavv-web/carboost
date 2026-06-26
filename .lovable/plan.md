## Диагноз

`.env` теперь читается — это уже хорошо. Но видно две ошибки:

1. `**MAIL_MAILER=smtp**` — система продолжает слать через Yandex SMTP (тот самый, что даёт `535 auth failed`). Нужно `unisender_go`.
2. `**MAIL_FROM_ADDRESS=growthpeak@yandex.ru**` — Unisender Go отвечает:
  ```
   Error in 'from_email' field. Denied 'from_email': growthpeak@yandex.ru - use address from a confirmed domain
  ```
   Отправлять можно только с **подтверждённого домена**. Подтверждён `mail.growth-peak.pro` (через DKIM/SPF/DMARC), значит `from` должен быть на этом домене, например `noreply@mail.growth-peak.pro`.

## Что поправить в `.env` на VPS

```bash
cd ~/growth-peak.pro/docs/backend
nano .env
```

Изменить **три** строки:

```env
MAIL_MAILER=unisender_go
MAIL_FROM_ADDRESS=noreply@mail.growth-peak.pro
MAIL_FROM_NAME=Growth Peak
```

(Старые `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD` для Yandex можно оставить как fallback или удалить — на работу Unisender они не влияют.)

сейчас так и есть

Заодно проверь, что задано:

```env
SALES_NOTIFICATION_EMAIL=zaslavv@gmail.com
```

где это указывать?

— чтобы заявки с сайта приходили тебе на gmail (сейчас пусто).

## Проверить, что домен реально подтверждён

В кабинете Unisender Go → **Settings → Sending domains** домен `mail.growth-peak.pro` должен быть со статусом **Verified** (зелёная галка по SPF и DKIM). Если статус не verified — `from_email` на этом домене тоже не пропустит, надо сначала дождаться проверки DNS (до 24ч после добавления записей в nic.ru).  
  
вот что указано в свойствах домена отправки


| Domain                                              | TTL  | Type  | Value                                                                                                                                                                                                                                      |
| --------------------------------------------------- | ---- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| @                                                   | 1800 | TXT   | v=spf1 include:[spf.unisender.ru](http://spf.unisender.ru) ~all                                                                                                                                                                            |
| us._domainkey                                       | 1800 | TXT   | v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCiZdqdi+dZWEInnUQ9ieoeKWopejXWhQSS0Jr0t9u+Tjf7Lii0b1qnGcfMySBNeNH71O571PBRhBuqSbKdSluPt31wvJphZupFd36wQ96MO2WvV5Dy3Y3kHzUtD/unvi7ey7hiBZS44ZwyiqBapqp2Kn/3B17yqR5cnWpxfepnmwIDAQAB |
| @                                                   | 1800 | TXT   | unisender-go-validate-hash=adb533d5c7d4f14f21428b9528f09276                                                                                                                                                                                |
| _dmarc                                              | 1800 | CNAME | [growth-peak.pro.dmarc.unisender.ru](http://growth-peak.pro.dmarc.unisender.ru).                                                                                                                                                           |
| [mail.growth-peak.pro](http://mail.growth-peak.pro) | 3600 | NS    | [uns1.unisender.com](http://uns1.unisender.com).                                                                                                                                                                                           |
| [mail.growth-peak.pro](http://mail.growth-peak.pro) | 3600 | NS    | [uns2.unisender.com](http://uns2.unisender.com).                                                                                                                                                                                           |
| [mail.growth-peak.pro](http://mail.growth-peak.pro) | 3600 | NS    | [uns3.unisender.com](http://uns3.unisender.com).                                                                                                                                                                                           |


## Применить и проверить

```bash
php artisan config:clear
php artisan cache:clear
php artisan smtp:status
php artisan unisender:test zaslavv@gmail.com
```

Ожидаемо:

- `smtp:status` → `Активный канал: unisender_go`
- `unisender:test` → `Письмо отправлено успешно` и оно реально придёт на [zaslavv@gmail.com](mailto:zaslavv@gmail.com).

## Если снова ошибка

- `[1574] use address from a confirmed domain` повторно → домен ещё не verified в Unisender, дожидаемся DNS.
- `[114] User ... not found` → API-ключ не от того аккаунта, в котором подтверждён домен; берём ключ из того же кабинета, где добавлен `mail.growth-peak.pro`.
- Любая другая — пришли вывод, разберём.