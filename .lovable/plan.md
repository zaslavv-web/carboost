## Проблема

На ai.google.dev бесплатный тир Gemini для новых аккаунтов сейчас фактически закрыт (Google убрал автоматическую выдачу free-ключей в ряде регионов, в РФ доступ через веб-консоль заблокирован без VPN). Получать платный ключ ради оживления AIGuild нерационально.

## Решение

У проекта уже есть **Lovable AI Gateway** (`LOVABLE_API_KEY` авто-провижен Lovable Cloud). Через него доступны модели `google/gemini-2.5-flash`, `google/gemini-2.5-pro`, `google/gemini-3.5-flash` и др. — **без личного ключа Google, оплата идёт кредитами workspace** (у проекта они уже есть, Gemini Flash — самые дешёвые).

Gateway — OpenAI-совместимый, значит существующий `OpenAICompatibleDriver` в Laravel будет работать, нужно только:

1. поменять URL на `https://ai.gateway.lovable.dev/v1/chat/completions`,
2. отправлять ключ в заголовке `Lovable-API-Key` (а не `Authorization: Bearer`),
3. указать модель `google/gemini-2.5-flash`.

## Что нужно сделать

### 1. Драйвер: поддержать заголовок Lovable-API-Key

В `backend-laravel/app/Services/AI/Drivers/OpenAICompatibleDriver.php` добавить ветку: если `provider === 'lovable_gateway'` (или URL содержит `ai.gateway.lovable.dev`) — слать `Lovable-API-Key: <key>` вместо `Authorization: Bearer <key>`. Заголовок `X-Lovable-AIG-SDK: laravel-http` для телеметрии.

### 2. Резолвер: новый пресет провайдера

В `AiSettingsResolver::buildDriver()` добавить case `'lovable_gateway'` с дефолтами:

- `api_url = https://ai.gateway.lovable.dev/v1/chat/completions`
- `model = google/gemini-2.5-flash`

Fallback (когда в БД пусто) переключить с `'gemini'` на `'lovable_gateway'`, чтобы новые компании работали из коробки.

### 3. UI настройки AI

В `src/pages/AiSettings.tsx` добавить в `PROVIDER_PRESETS` пункт:

```
lovable_gateway: {
  url: "https://ai.gateway.lovable.dev/v1/chat/completions",
  model: "google/gemini-2.5-flash",
  label: "Lovable AI (Gemini)",
  description: "Gemini через Lovable AI Gateway. Ключ не требуется — оплата кредитами workspace.",
}
```

Поставить его первым в `PROVIDERS_ORDER`.

### 4. Секрет на бэкенде

Laravel-бэкенд крутится на Beget (growth-peak.pro), не в Lovable Cloud, поэтому `LOVABLE_API_KEY` там не появится автоматически. Нужно:

- получить значение `LOVABLE_API_KEY` из Lovable (я вытащу через `fetch_secrets` / при необходимости ротирую),
- прописать в `backend-laravel/.env` на проде:
  ```
  AI_API_URL=https://ai.gateway.lovable.dev/v1/chat/completions
  AI_API_KEY=<значение LOVABLE_API_KEY>
  AI_MODEL=google/gemini-2.5-flash
  ```
- `php artisan config:clear` на сервере.

### 5. Проверка

После деплоя — кнопка «Проверить соединение» на `/ai-settings` (endpoint `/ai-settings/test`) должна вернуть OK и превью ответа.

## Что нужно от вас

1. Подтвердить план.
2. Дать доступ к `.env` на growth-peak.pro (или сами вставите строки — я подготовлю точный блок).

## Альтернативы (если не хотим Lovable Gateway)

- **OpenRouter** — free-tier Gemini/Llama, регистрация без карты, ключ выдаётся сразу. Драйвер тот же (OpenAI-совместимый), правки минимальны.
- **GigaChat / YandexGPT** — уже есть готовые драйверы, работают в РФ, free-tier у обоих.
- **Купить $2 на DeepSeek** — обсуждали ранее.

Скажите, идём через Lovable Gateway или предпочитаете OpenRouter / российского провайдера?  
какие риски у пути openrouter?