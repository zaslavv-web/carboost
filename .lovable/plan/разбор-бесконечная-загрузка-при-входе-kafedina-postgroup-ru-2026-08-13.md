# Разбор: бесконечная загрузка при входе ([kafedina@postgroup.ru](mailto:kafedina@postgroup.ru))

## Что известно

- Аккаунт создан через приглашение от HR/HRD.
- Другие учётки входят нормально — значит ломается не общий флоу, а данные конкретного пользователя.
- Симптом: не текст ошибки, а вечный спиннер. В коде спиннер без таймаута есть в двух местах `ProtectedRoute`: «Восстанавливаем сессию…» (пока `loading`) и «Загружаем личный кабинет…» (пока грузится профиль).

Диагноз пока не подтверждён — сначала снимаем факты, потом чиним.

## Шаг 1. Снять факты (read-only, без изменения данных)

На боевом сервере в каталоге бэкенда выполнить проверку строк этого пользователя:

- есть ли запись в `users` (id, есть ли password, email_verified_at, meta);
- есть ли `profiles` по `user_id` и совпадает ли он с id из `users` (типичная поломка приглашений: профиль привязан к другому идентификатору);
- есть ли роли в `user_roles`, есть ли `company_id` в профиле.

Плюс в браузере пользователя: открыть DevTools → Network при входе и зафиксировать, какой запрос «висит» или падает — `/api/auth/login`, `/api/auth/me` или `/api/profiles/me`. Это однозначно указывает на место зависания.

&nbsp;

30 requests

3.7 MB transferred

4.0 MB resources

Finish: 13.3 min

﻿

index-DXfCMjJK.js:1360  GET [https://growth-peak.pro/api/profiles/me](https://growth-peak.pro/api/profiles/me) 500 (Internal Server Error)


|        |                             |        |                        |
| ------ | --------------------------- | ------ | ---------------------- |
| &nbsp; | window.fetch                | @      | index-DXfCMjJK.js:1360 |
| &nbsp; | sg                          | @      | index-DXfCMjJK.js:998  |
| &nbsp; | get                         | @      | index-DXfCMjJK.js:999  |
| &nbsp; | queryFn                     | @      | index-DXfCMjJK.js:1007 |
| &nbsp; | i                           | @      | index-DXfCMjJK.js:40   |
| &nbsp; | p                           | @      | index-DXfCMjJK.js:40   |
| &nbsp; | start                       | @      | index-DXfCMjJK.js:40   |
| &nbsp; | fetch                       | @      | index-DXfCMjJK.js:40   |
| &nbsp; | fv                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | setOptions                  | @      | index-DXfCMjJK.js:40   |
| &nbsp; | (anonymous)                 | @      | index-DXfCMjJK.js:40   |
| &nbsp; | yC                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | zg                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | (anonymous)                 | @      | index-DXfCMjJK.js:40   |
| &nbsp; | _                           | @      | index-DXfCMjJK.js:25   |
| &nbsp; | T                           | @      | index-DXfCMjJK.js:25   |
| &nbsp; | **postMessage**             | &nbsp; | &nbsp;                 |
| &nbsp; | O                           | @      | index-DXfCMjJK.js:25   |
| &nbsp; | I                           | @      | index-DXfCMjJK.js:25   |
| &nbsp; | e.unstable_scheduleCallback | @      | index-DXfCMjJK.js:25   |
| &nbsp; | dZ                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | Oi                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | Rl                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | d0e                         | @      | index-DXfCMjJK.js:38   |
| &nbsp; | (anonymous)                 | @      | index-DXfCMjJK.js:999  |
| &nbsp; | **await in (anonymous)**    | &nbsp; | &nbsp;                 |
| &nbsp; | (anonymous)                 | @      | index-DXfCMjJK.js:999  |
| &nbsp; | yC                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | zg                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | xB                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | Gf                          | @      | index-DXfCMjJK.js:38   |
| &nbsp; | E0e                         | @      | index-DXfCMjJK.js:40   |
| &nbsp; | Nh                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | sZ                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | _                           | @      | index-DXfCMjJK.js:25   |
| &nbsp; | T                           | @      | index-DXfCMjJK.js:25   |
| &nbsp; | **postMessage**             | &nbsp; | &nbsp;                 |
| &nbsp; | O                           | @      | index-DXfCMjJK.js:25   |
| &nbsp; | I                           | @      | index-DXfCMjJK.js:25   |
| &nbsp; | e.unstable_scheduleCallback | @      | index-DXfCMjJK.js:25   |
| &nbsp; | dZ                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | Oi                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | Rl                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | wC                          | @      | index-DXfCMjJK.js:40   |
| &nbsp; | jC.render.s5.render         | @      | index-DXfCMjJK.js:40   |
| &nbsp; | (anonymous)                 | @      | index-DXfCMjJK.js:1392 |


## Шаг 2. Исправить причину

В зависимости от результата шага 1 — один из вариантов:

- рассинхрон id между `users` и `profiles` → починить привязку профиля (точечно для этого пользователя, тем же механизмом, что и существующая команда восстановления связей);
- отсутствует `company_id` / роль → проставить корректные значения из приглашения;
- ошибка на стороне `/profiles/me` (500) → поправить контроллер.

## Шаг 3. Убрать саму возможность «вечного спиннера»

Независимо от причины, зависание без сообщения — дефект интерфейса. Добавим защиту:

- таймаут на этапах «Восстанавливаем сессию…» и «Загружаем личный кабинет…» (~15 сек): вместо бесконечного спиннера показывать понятный экран с причиной и кнопками «Повторить» / «Выйти и войти заново»;
- при ошибке загрузки профиля показывать текст ошибки, а не молча крутить спиннер.

## Технические детали

- Затрагиваемые файлы фронта: `src/components/ProtectedRoute.tsx` (таймаут и состояние ошибки), при необходимости `src/hooks/useLaravelProfile.ts` (ограничение ретраев, чтобы запрос не «висел» долго).
- Бэкенд: правки только если шаг 1 покажет ошибку в `ProfileController`/связках; данные пользователя правим точечно, без массовых миграций.
- Проверка после фикса: повторный вход под этой учёткой и контроль ответов `/api/auth/me` и `/api/profiles/me`.