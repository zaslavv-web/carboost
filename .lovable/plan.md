## Что произошло

На сервере в `/home/gro7659365/growth-peak.pro/docs/backend` лежит репозиторий `zaslavv-web/carboost` — это **Laravel-бэкенд** (`backend-laravel`). В нём есть свой мини-Vite для Blade-ассетов админки, отсюда вывод:

```
public/build/manifest.json
public/build/assets/app-*.css   20 kB
public/build/assets/app-*.js    46 kB
✓ 55 modules transformed
```

Это НЕ React-фронтенд Growth Peak (в нём ~2000+ модулей и артефакт в `dist/`). React-фронт лежит в отдельном Lovable-проекте и публикуется **через Lovable Hosting**, а не через git pull на вашем сервере. Домен `growth-peak.pro` привязан как custom domain к Lovable-публикации (`carboost.lovable.app`).

Поэтому все правки последних дней (Today-режим, кнопка «Режим Today», снятие allowlist в `src/lib/hrdUiMode.ts` и т.д.) **на прод не попадут через сервер** — там просто нет исходников React-фронта.

## Что нужно сделать

### 1. Опубликовать фронт через Lovable

В редакторе Lovable нажать **Publish → Update**. После этого:

- `carboost.lovable.app` обновится сразу,
- `growth-peak.pro` (custom domain) подтянет ту же сборку автоматически.

Никакой сборки на сервере для фронта делать не нужно.

### 2. Сборку в `docs/backend` на сервере откатить/игнорировать

То, что вы собрали (`public/build/*`), — это ассеты Blade-страниц Laravel (страницы логина, писем и т.п.), они безопасны, но никак не влияют на HRD-интерфейс. Оставить как есть можно, ничего не ломает.

### 3. Проверка после Publish

Зайти под `growthpeak@yandex.ru` на `https://growth-peak.pro`:

- при первом заходе — модалка выбора режима (Today / Классический),
- в классическом сайдбаре внизу — кнопка «Режим Today»,
- на `/today` — Inbox + KPI + StudioRail с «домиком».

Если Publish уже нажимали, но изменений нет — сбросить `localStorage.hrd_ui_mode` в браузере и обновить страницу (модалка появится заново).

## Технические детали

- Репо на GitHub `zaslavv-web/carboost` = Laravel backend + deploy-конфиги. Свой `package.json` внутри `backend-laravel/` собирает Blade-ассеты в `public/build/`, это ожидаемо.
- Lovable-проект (этот) = React SPA, публикуется Lovable Hosting. Custom domain `growth-peak.pro` настроен в Project Settings → Domains.
- Frontend-изменения требуют клика **Update** в диалоге Publish; backend/edge — деплоятся автоматически, но у вас бэкенд свой (Laravel на сервере) и обновляется через `git pull` в `backend-laravel/` + `php artisan migrate` (что вы и делали ранее для RPC/миграций).

## Итоговый чеклист

1. Нажать Publish → Update в Lovable.
2. Открыть `https://growth-peak.pro` под HRD — убедиться, что модалка/Today/кнопка «Режим Today» появились.
3. Ничего дополнительно на сервере для фронта делать не нужно.

это что за новости?!  
А поддерживать я это как буду?

переделывай  
Lovable - ВСПОМОГАТЕЛЬНЫЙ инструмент, а не замена нормальной разработке

&nbsp;