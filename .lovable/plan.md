# Чёрный экран при повторном входе — диагностика и план

## Что происходит

Симптом «пустой чёрный экран, спасает только сброс кеша» — классический признак **устаревшего `index.html` в кеше браузера после деплоя**, а не проблемы авторизации:

1. После предыдущего визита браузер сохранил старый `index.html`, ссылающийся на конкретные хешированные бандлы `/assets/index-AAA.js`.
2. Был задеплоен новый билд → старые чанки удалены, лежат `/assets/index-BBB.js`.
3. При повторном заходе браузер берёт **старый** `index.html` из кеша (в `deploy/nginx.conf` для html не задано `no-store` — задано только для `.js/.css` через `immutable 1y`, а сам html попадает в дефолтный disk cache).
4. Запрос за `/assets/index-AAA.js` возвращает 404 (или html-fallback из `try_files` → MIME-mismatch).
5. Любая `lazy()`/dynamic import падает с `ChunkLoadError`. `**<App />` не обёрнут в `ErrorBoundary**` (он есть в `src/components/ErrorBoundary.tsx`, но в `src/main.tsx` не используется), поэтому React рендерит пустоту → чёрный экран на фоне `bg-background` из темы.
6. Hard reload (`Ctrl+Shift+R`) форсит загрузку нового `index.html` → всё чинится.

Сценарий «при повторном входе» совпадает: первый вход после деплоя проходит на свежем html (логин-форма), а после редиректа/повторного открытия страница берётся из cache с устаревшим html.

Авторизация (`LaravelAuthContext` + `laravelAuthApi.me`) здесь не виновата — она корректно ловит 401 и сбрасывает токен; проверено по коду.

## Что делаем

### 1. Гарантированный экран ошибки вместо чёрного фона

`src/main.tsx`: обернуть `<App />` в существующий `ErrorBoundary`. Тогда даже при `ChunkLoadError` пользователь увидит карточку «Что-то пошло не так» с кнопкой «Перезагрузить».

### 2. Авто-recovery от устаревших чанков

`src/main.tsx`: добавить глобальный слушатель `window.addEventListener("error", ...)` и `unhandledrejection`, которые ловят `ChunkLoadError` / `Loading chunk * failed` / `Failed to fetch dynamically imported module` и один раз (через `sessionStorage` guard, чтобы избежать петли) делают `window.location.reload()`. Это закрывает кейс «пользователь даже не успевает увидеть кнопку».

### 3. Запрет кеширования `index.html` на nginx

`deploy/nginx.conf` (location `/`): добавить

```
add_header Cache-Control "no-store, must-revalidate";
add_header Pragma "no-cache";
```

Хешированные ассеты (`.js/.css/...`) остаются `immutable 1y` — это правильно. Кешируется только тот файл, который **должен** обновляться при каждом деплое.

### 4. Тот же фикс для дев-хостинга через Apache

`public/.htaccess`: добавить блок `<Files "index.html">` с `Header set Cache-Control "no-store, must-revalidate"`.

### 5. Подстраховка в HTML

`index.html`: добавить `<meta http-equiv="Cache-Control" content="no-store">` в `<head>` для прокси/CDN, которые игнорируют ответные заголовки.

## Затрагиваемые файлы

- `src/main.tsx` — ErrorBoundary + chunk-error guard
- `deploy/nginx.conf` — Cache-Control для `location /`
- `public/.htaccess` — Cache-Control для `index.html`
- `index.html` — `<meta http-equiv>` страховка

Что **не трогаем**: `AuthContext`, `LaravelAuthContext`, бэкенд — там багов по этому симптому нет.

## Проверка

1. Деплой → открыть прод → войти → выйти → закрыть вкладку → открыть снова. Чёрного экрана быть не должно.
2. Эмуляция: задеплоить, открыть страницу, переименовать `dist/assets/index-*.js`, перезагрузить — должен сработать авто-reload (или показаться карточка ErrorBoundary при повторе).
3. `curl -I https://.../index.html` → `Cache-Control: no-store`.  
  
  
Как буд-то этого мало - проблема наблюдается и сейчас хотя со времени последнего деплоя прошли почти сутки  
поищи проблему в работе с куки - возможно нужно подумать в сторону сброса сессии или что-то типа того
  &nbsp;