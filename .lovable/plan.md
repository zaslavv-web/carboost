Unisender Go отдал тебе список DNS-записей, которые нужно прописать в зоне домена `growth-peak.pro` (там же, где ты делал A-записи для VPS — судя по истории, это nic.ru). Пока этих записей нет в DNS, Unisender Go не подтвердит домен и будет отдавать ошибку 1574.

## Что сделать у регистратора (nic.ru → DNS-зона growth-peak.pro)

Добавить ровно 6 записей. В колонке «Имя/Subdomain» вводи именно то, что указано — без `.growth-peak.pro` в конце (регистратор сам подставит).

### 1) SPF (TXT на корне)

- Тип: `TXT`
- Имя: `@`
- TTL: `1800`
- Значение:
  ```text
  v=spf1 include:spf.unisender.ru ~all
  ```

Важно: если на `@` уже есть другая TXT с `v=spf1 ...` (например от Yandex) — её надо **объединить**, а не создавать вторую. Двух SPF-записей быть не должно. Если активной отправки через Yandex больше нет — старую SPF удалить, оставить только эту.

### 2) DKIM (TXT)

- Тип: `TXT`
- Имя: `us._domainkey`
- TTL: `1800`
- Значение (одной строкой, без переносов):
  ```text
  v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCiZdqdi+dZWEInnUQ9ieoeKWopejXWhQSS0Jr0t9u+Tjf7Lii0b1qnGcfMySBNeNH71O571PBRhBuqSbKdSluPt31wvJphZupFd36wQ96MO2WvV5Dy3Y3kHzUtD/unvi7ey7hiBZS44ZwyiqBapqp2Kn/3B17yqR5cnWpxfepnmwIDAQAB
  ```

### 3) Verification-hash (TXT на корне)

- Тип: `TXT`
- Имя: `@`
- TTL: `1800`
- Значение:
  ```text
  unisender-go-validate-hash=adb533d5c7d4f14f21428b9528f09276
  ```

Это вторая TXT на `@` — это нормально (SPF и verification hash могут сосуществовать как отдельные TXT-записи; правило «одна запись» касается только SPF).

### 4) DMARC (CNAME)

- Тип: `CNAME`
- Имя: `_dmarc`
- TTL: `1800`
- Значение:
  ```text
  growth-peak.pro.dmarc.unisender.ru.
  ```

Точка в конце обязательна. Если на `_dmarc` уже есть TXT-запись — её нужно удалить, иначе CNAME не примут.

### 5–7) Делегирование поддомена `mail.growth-peak.pro` на Unisender (NS)

- Тип: `NS`, Имя: `mail`, TTL: `3600`, Значение: `uns1.unisender.com.`
- Тип: `NS`, Имя: `mail`, TTL: `3600`, Значение: `uns2.unisender.com.`
- Тип: `NS`, Имя: `mail`, TTL: `3600`, Значение: `uns3.unisender.com.`

В nic.ru обычно три отдельные записи с одним именем `mail` и разными значениями. Точки в конце имён серверов обязательны.

Важно: после этого **весь поддомен `mail.growth-peak.pro` управляется Unisender'ом**. Если у тебя сейчас есть какие-то записи на `mail.growth-peak.pro` (A, MX, TXT и т.п.) у nic.ru — они перестанут работать. Судя по конфигу, ты используешь только `noreply@mail.growth-peak.pro` для отправки — это ок.

## После сохранения записей

1. Подожди распространения DNS — обычно 15 минут–2 часа, иногда до суток. Проверить можно так:
  ```bash
   dig +short TXT us._domainkey.growth-peak.pro
   dig +short TXT growth-peak.pro
   dig +short NS mail.growth-peak.pro
   dig +short CNAME _dmarc.growth-peak.pro
  ```
   Должны вернуться те же значения, что выше.
2. В кабинете Unisender Go нажми **Проверить** рядом с доменом `growth-peak.pro`. Когда все галочки станут зелёными — домен подтверждён.
3. На VPS повтори тест:
  ```bash
   cd ~/growth-peak.pro/docs/backend
   php artisan unisender:test zaslavv@gmail.com
  ```
   Ожидаемый результат: `OK — письмо отправлено`.

Код в проекте менять не нужно — это правки только в DNS-зоне у регистратора.  
это все сделано давным-давно иначе unisender не смог бы подтвердить домен