План:

1. Исправить CI `.github/workflows/npm-publish.yml`:
   - добавить переменную `GEOIP_PROVIDER_SECRET: ${{ secrets.GEOIP_PROVIDER }}`;
   - записывать в backend `.env` строку `GEOIP_PROVIDER="ip-api"` по умолчанию, если секрет не задан;
   - сохранить `GEOIP_DISABLED="0"`, чтобы геопроверка точно не была отключена.

2. Усилить backend `GeoIpService`:
   - если `ipapi.co` не отвечает или возвращает не страну, автоматически пробовать `ip-api.com` как fallback;
   - оставить поддержку `GEOIP_PROVIDER=ip-api`, чтобы можно было принудительно использовать рабочий провайдер.

3. Добавить безопасную диагностику в `/api/geo`:
   - показать текущий GeoIP provider и определённый IP/страну без секретов;
   - так будет видно, почему Google не скрывается: не тот IP, не тот provider или страна `null`.

4. Что важно по вашему новому секрету:
   - секрет с именем `ip-api` ситуацию не исправит, потому что backend читает переменную `GEOIP_PROVIDER`;
   - `ip-api` — это значение, а не имя секрета;
   - правильный GitHub Secret: `GEOIP_PROVIDER` со значением `ip-api`, либо можно вообще не задавать секрет после правки — workflow сам поставит `ip-api` по умолчанию.

После применения нужно будет сделать push/запустить workflow и проверить:

```bash
curl -s https://growth-peak.pro/api/geo | python -m json.tool
```

Ожидаемо для российского IP:

```json
{
  "country": "RU",
  "is_ru": true,
  "providers": {
    "google": false,
    "yandex": true
  }
}
```