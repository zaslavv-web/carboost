# Тестирование «Пик роста»

Четыре уровня: unit фронта, unit/feature бэка, E2E (API + UI по ролям) и нагрузочное тестирование.

| Уровень | Инструмент | Где | Команда |
|---|---|---|---|
| Unit / компоненты фронта | Vitest + Testing Library | `src/**/*.test.ts(x)` | `npm run test` |
| Unit / Feature бэка | PHPUnit (sqlite in-memory) | `backend-laravel/tests` | `cd backend-laravel && php artisan test` |
| E2E API по ролям | Playwright | `src/e2e/api` | `npm run test:e2e:api` |
| E2E UI по ролям | Playwright | `src/e2e/ui` | `npm run test:e2e:ui` |
| Визуальная регрессия лендинга | Playwright | `src/e2e/landing.visual.spec.ts` | `npm run test:visual` |
| Нагрузка 100 VU | Node / k6 | `scripts/loadtest` | `npm run test:load` |

## 1. Фронтенд

```bash
npm run test           # весь набор
npm run test:watch     # watch-режим
```

Сеть всегда мокается (`vi.mock` клиента или `global.fetch`) — тесты не ходят наружу.

## 2. Бэкенд

```bash
cd backend-laravel
composer install
php artisan test
```

## 3. E2E

Спеки ничего не создают в проде по умолчанию (`E2E_ALLOW_WRITES` выключен) и **скипаются**, если для роли не заданы креды — так CI не падает на неполной конфигурации.

```bash
export E2E_BASE_URL=https://growth-peak.pro
export E2E_HRD_EMAIL=... E2E_HRD_PASSWORD=...
export E2E_EMPLOYEE_EMAIL=... E2E_EMPLOYEE_PASSWORD=...
# опционально: E2E_HR_*, E2E_MANAGER_*, E2E_ADMIN_*, E2E_SUPERADMIN_*

npm run test:e2e         # api + ui-desktop + ui-mobile
npm run test:e2e:api     # только API-смоук (быстро, без браузера)
```

Что проверяется:

- `/api/health` жив, БД отвечает;
- под каждой ролью логин выдаёт Sanctum-токен;
- ключевые эндпоинты роли не отдают 5xx, `/profiles/me` укладывается в 5 c;
- тяжёлый справочник `/profiles?per_page=200` не падает (та самая история с 500 и памятью);
- сотрудник **не** получает доступ к `/predictive/*` и `/talent-review/*`;
- в UI ключевые маршруты роли рендерятся без белого экрана, без ошибок в консоли и без 5xx в сети (десктоп и мобильный вьюпорт).

У учёток для E2E не должно быть включённой 2FA — challenge автоматически не проходится, спека сообщит об этом явно.

## 4. Нагрузочное тестирование (100 пользователей)

```bash
LT_BASE_URL=https://growth-peak.pro \
LT_EMAIL=hrd@example.com LT_PASSWORD='...' \
npm run test:load
```

Честнее — пул реальных учёток (разные права и кеши):

```bash
LT_USERS='[{"email":"a@x.ru","password":"..."},{"email":"b@x.ru","password":"..."}]' npm run test:load
```

Профиль по умолчанию: **ramp-up 20 c → 100 VU → полка 60 c**, think-time ~1 c с джиттером, взвешенный микс запросов рабочего дня (дашборд, задачи, чаты, монеты, справочники, каталог сотрудников). Режим read-only.

Настройки: `LT_VUS`, `LT_DURATION`, `LT_RAMP`, `LT_THINK`, `LT_TIMEOUT`, `LT_READONLY`, `LT_SLO_P95`, `LT_SLO_ERROR`.

SLO по умолчанию: **p95 ≤ 2000 мс**, **ошибок ≤ 1 %**. При пробое скрипт выходит с кодом 1.

Результат: `docs/LOAD-TEST-REPORT.md` (сводка + разбивка по эндпоинтам, снимок `/api/health` до и после) и сырой JSON в `docs/loadtest/`.

Альтернатива на k6, если он есть на стенде:

```bash
k6 run -e BASE_URL=https://growth-peak.pro -e EMAIL=... -e PASSWORD=... scripts/loadtest/k6-100vu.js
```

### Как читать результат

- **5xx > 0** — почти всегда исчерпание памяти PHP или `max_user_connections` в MySQL; смотри `/api/health` (`peak_mb`, `memory_limit`) и `api-fatals.jsonl`.
- **Рост p95 при неизменном p50** — упирается пул соединений/воркеров PHP-FPM, а не код.
- **Таймауты пачками в конце полки** — накопление медленных запросов; ищи виновника в разбивке по эндпоинтам (таблица отсортирована по p95).

## CI

`.github/workflows/tests.yml` гоняет фронтовые unit-тесты и сборку на каждый push,
а E2E-смоук — по расписанию и вручную (`workflow_dispatch`) против прода, если в
секретах репозитория заданы креды. Нагрузочный прогон запускается только вручную,
чтобы не долбить боевой стенд.
