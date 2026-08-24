# Фикс фатальной ошибки PHP и блокировки git pull

## Что произошло

1. **Фатальная ошибка.** В `DbController` метод назван `authorizeResource` и объявлен как `private`. В базовом классе `Controller` (трейт Laravel `AuthorizesRequests`) уже есть публичный метод с тем же именем — PHP запрещает понижать видимость, поэтому падает весь процесс: `Access level to ... authorizeResource() must be public`. Это ломает и тесты в CI, и приложение целиком.

2. **`git pull` на боевом не проходит.** На сервере есть локальные изменения в `package.json` и `.gitignore`, которые перезаписал бы merge. Поэтому новый код (в том числе фиксы 500) на боевой ещё не приехал.

## Что сделать в коде

Переименовать конфликтующий метод в `DbController` в `enforceResourceAccess` (имя не пересекается с трейтом Laravel) и обновить все 4 места вызова: строки 205, 620, 676, 735. Логика метода не меняется — та же проверка ролевой модели с fail-open при исключении.

## Как выкатить на боевой

Локальные правки на сервере в `package.json` и `.gitignore` не нужны (бэкенд-каталог не должен расходиться с репозиторием):

```
cd /home/gro7659365/growth-peak.pro/docs/backend
git stash push -- package.json .gitignore   # либо git checkout -- package.json .gitignore
git pull
php artisan migrate --force
php artisan optimize:clear
```

Если файлы в стеше не понадобятся — `git stash drop`.

## Проверка после выката

```
php artisan test --filter=DbController
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://growth-peak.pro/api/db/positions?select=id,title,department&order=title.asc&limit=200"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://growth-peak.pro/api/db/profiles?select=company_id&maybeSingle=1&eq.user_id=1041"
```

Ожидаем зелёные тесты и 200/200. Ошибка React #301 в браузере — следствие падения этих запросов, отдельной правки не требует; перепроверим после выката.
