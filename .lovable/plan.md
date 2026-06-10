## Аудит упоминаний `supabase`

Не всё «supabase» одинаково опасно. Разделил находки на 5 групп — удалять можно только часть, остальное либо безвредно, либо умышленно, либо вообще не подконтрольно мне.

---

### Группа 1 — РАНТАЙМ-АРТЕФАКТЫ Lovable Cloud (удалять/нейтрализовать)


| Файл                                  | Что                                                                              | Действие                                                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `.env`                                | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Удалить 3 строки. Lovable Cloud их регенерирует — но фронт ими уже не пользуется, утечки публичного анон-ключа в прод-`.env` это уменьшит. |
| `src/integrations/supabase/client.ts` | Сейчас inert-Proxy (нет импорта `@supabase/supabase-js`)                         | Оставить как есть — Lovable Cloud может перезаписать, но Proxy безвреден.                                                                  |
| `src/integrations/supabase/types.ts`  | Autogen, файл **read-only**                                                      | Не могу удалить технически. Никем не импортируется. Оставить.                                                                              |
| `supabase/config.toml`                | 1 строка `project_id`                                                            | Можно удалить, но Lovable Cloud перегенерирует. Оставить — безвреден.                                                                      |


---

### Группа 2 — КОММЕНТАРИИ и ИМЕНА API в активном фронте (можно вычистить)

Это комментарии вида «drop-in replacement for `supabase.from(...)`» в `src/integrations/laravel/*` и `src/lib/translateBackendError.ts`, `src/contexts/AuthContext.tsx`, `LaravelAuthContext.tsx`. Они не выполняют код, но содержат слово `supabase`.

**Предлагаю:** переписать комментарии в нейтральном виде («drop-in API совместимый с прежним клиентом БД»). Это косметика, ничего не ломает.

---

### Группа 3 — ПОЛЬЗОВАТЕЛЬСКИЙ ТЕКСТ на лендинге (требует решения)

`src/i18n/locales/{ru,en}/landing.json` строка 153:

- RU: `"Свой Supabase + Postgres"`
- EN: `"Bring your own Supabase + Postgres"`

Это маркетинговый пункт «портативность — можно подключить свой бэкенд». Удалять = убирать фичу с лендинга. **Нужно ваше решение** (см. вопрос ниже).

---

### Группа 4 — BACKEND LARAVEL (историческая документация миграции)

~50 файлов в `backend-laravel/`:

- **READMEs** (`README-auth.md`, `README-api.md`, `README-db-rpc-storage.md`, `README-policies.md`, `README-frontend-auth.md`) — описывают, **как и почему** мигрировали с Supabase на Laravel. Это ценная инженерная документация для on-prem команды.
- **Миграции** (`backend-laravel/database/migrations/*.php`) — в шапках указано «портировано из дампа Supabase». Это атрибуция источника схемы.
- **Дамп данных** `backend-laravel/database/dumps/careertrack_data_20260517_083114.sql` — исторический дамп, импортируется командой ниже.
- `**app/Console/Commands/ImportSupabaseDump.php**` — рабочая artisan-команда `php artisan supabase:import`, нужна при разворачивании on-prem с исторических данных.
- **Комментарии в коде** (`ImpersonationService.php`, `AuthUserService.php`, `routes/api.php`, `config/filesystems.php`) — поясняют, что метод заменяет такой-то supabase-вызов.

**Моё мнение:** ничего здесь не удалять. Это либо историческая атрибуция, либо рабочая утилита миграции, либо документация для on-prem развёртывания. Удаление = потеря знаний без выигрыша в безопасности (бэкенд к Supabase не ходит).

---

### Группа 5 — `old/lovable-supabase/` (архив, 89 КБ)

Уже вынесено в `old/`, помечено в README как «можно удалить, если откат не нужен».

**Предлагаю:** удалить целиком, если вы подтверждаете, что откат на Lovable Cloud не нужен.

---

### Группа 6 — Сборочные артефакты

- `tsconfig.app.tsbuildinfo` — кэш TS, перегенерируется. Можно стереть, но появится снова.
- `.lovable/plan.md` — внутренний план агента. Не трогаем.

---

## Что я предлагаю сделать (по умолчанию)

1. **Группа 1**: удалить 3 строки `VITE_SUPABASE_*` из `.env`.
2. **Группа 2**: вычистить слово `supabase` из комментариев в активном `src/` (laravel-адаптеры, AuthContext, translateBackendError).
3. **Группа 5**: удалить `old/lovable-supabase/` целиком.
4. **Группы 3 и 4**: НЕ трогать без вашего явного решения.

## Что НЕ буду делать (объясняю)

- Не буду менять `src/integrations/supabase/{client.ts,types.ts}` — autogen Lovable Cloud (types.ts вообще read-only).
- Не буду удалять `supabase/config.toml` — Lovable Cloud его регенерирует.
- Не буду удалять READMEs/миграции/`ImportSupabaseDump.php` в backend-laravel — это рабочая on-prem документация и утилита.

## Вопросы, которые нужно решить перед запуском (group 3 и 4)

- **landing.json**: убрать пункт «Свой Supabase + Postgres» или переформулировать в «Свой Postgres-бэкенд»? = убрать
- **backend-laravel READMEs/комментарии**: оставить как историю миграции (рекомендую) или всё-таки вычистить упоминания? = оставить
- `old/lovable-supabase/`: удалять архив? - да

Перепроверь чтобы ничего не поломалось