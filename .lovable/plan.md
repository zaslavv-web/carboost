## Цель
Убрать предупреждение GitHub Actions о Node.js 20 — обновить экшены до версий, работающих на Node.js 24.

## Контекст
GitHub с 19 сентября 2025 объявил Node.js 20 deprecated. `actions/checkout@v4` всё ещё построен на Node 20 и форсированно запускается на Node 24, что и вызывает warning. Решение — поднять до `actions/checkout@v5` (Node 24 нативно). Заодно обновить `actions/setup-node` до v5 ради консистентности.

## Изменения

### `.github/workflows/npm-publish.yml`
- строка 14: `actions/checkout@v4` → `actions/checkout@v5`
- строка 17: `actions/setup-node@v4` → `actions/setup-node@v5`
- строка 52: `actions/checkout@v4` → `actions/checkout@v5`

### `.github/workflows/backup.yml`
- строка 21: `actions/checkout@v4` → `actions/checkout@v5`

## Проверка
Изменения тривиальны — только теги версий. После мержа следующий запуск workflow не должен показывать предупреждение про Node 20.
