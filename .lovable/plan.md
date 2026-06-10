## Полный аудит — 74 файла с упоминанием `supabase`

Сделал свежий рекурсивный скан. Прошлый план оставлял backend-laravel нетронутым по вашему явному решению — сейчас вы просите обратное. Прежде чем сносить, надо подтвердить, что мы понимаем последствия одинаково.

---

## Категории находок

### A. Inert — НЕ ТРОГАЕМ по вашему условию (2)

- `src/integrations/supabase/client.ts` — inert Proxy
- `src/integrations/supabase/types.ts` — autogen, read-only

### B. Файлы, существующие **ради** Supabase-миграции (можно удалить целиком)

1. `supabase/config.toml` (+ папка) — autogen Lovable Cloud, перегенерируется при сохранении
2. `deploy/import-supabase-dump.sh` — bash-импортёр дампа
3. `backend-laravel/app/Console/Commands/ImportSupabaseDump.php` — artisan-команда `supabase:import`
4. `backend-laravel/database/dumps/careertrack_data_20260517_083114.sql` (287 строк) — исторический дамп данных
5. `backend-laravel/database/dumps/README.md` — описывает дамп
6. `.lovable/plan.md` — старый план (можно перезаписать новым)

### C. Артефакты сборки (перегенерируются)

- `tsconfig.app.tsbuildinfo` — кэш TS

### D. Документация миграции — backend-laravel (5 README, ~250 упоминаний)

- `backend-laravel/README.md`
- `backend-laravel/REVERB.md`
- `backend-laravel/.env.example`
- `backend-laravel/app/README-auth.md`
- `backend-laravel/app/README-api.md`
- `backend-laravel/app/README-policies.md`
- `backend-laravel/app/README-frontend-auth.md`
- `backend-laravel/app/README-db-rpc-storage.md`
- `backend-laravel/database/migrations/README.md`
- `backend-laravel/database/DATABASE_STRUCTURE.md`
- `DEPLOYMENT.md`

### E. Активный PHP-код и миграции (~60 файлов)

- 47 миграций `backend-laravel/database/migrations/0002_*.php` — в шапках: «перенос из Supabase», «bcrypt из Supabase», ссылки на `auth.users` (схема, созданная Supabase)
- Сервисы: `ImpersonationService.php`, `AuthUserService.php`
- Контроллеры: `RpcController.php`, `DbController.php`, `StorageController.php`, `GoogleAuthController.php`, `PasswordResetController.php`, `Admin/UsersController.php`
- `Policies/BasePolicy.php`, `Providers/AuthServiceProvider.php`
- `routes/api.php` (5 строк-комментариев)
- `config/filesystems.php`

---

## ⚠️ Реальные проблемы массового удаления

1. **Backend сейчас фактически работает на Supabase-дампе.** Pароли в `users.password` — bcrypt из Supabase; схема `auth` создана Supabase-импортом; триггер `handle_new_user` — из supabase. Это не «упоминание», это **факт развёртывания**. Удаление комментариев скроет факт, но не изменит его.
2. `**ImportSupabaseDump.php` + `import-supabase-dump.sh` + дамп `.sql**` — это инфраструктура on-prem старта. Без них новый on-prem инстанс не подымется с историческими данными. Если on-prem не нужен — можно удалить, но это **архитектурное решение**, не косметика.
3. **47 миграций** — переписывать комментарии без потери смысла можно (заменить «Supabase» → «исходная схема» / «legacy»). Это ~150 точечных правок.

---

## Два варианта — выберите один

### Вариант 1 — «Хирургический» (рекомендую)

- Удалить группы **B** + **C** целиком (если on-prem с историческим импортом больше не нужен)
- В группах **D** и **E** — **переписать** упоминания на нейтральные («legacy schema», «исходный дамп», «PostgREST-style») без потери технического смысла
- Inert-файлы (A) не трогаем
- Сохранить функциональность бэкенда

### Вариант 2 — «Выжечь напалмом»

- Удалить группу **B**, **C**, **D** (все README) целиком
- В группе **E** удалить все комментарии-упоминания (миграции/сервисы/контроллеры остаются работать, теряем только пояснения)
- Inert-файлы (A) не трогаем
- Документация миграции пропадает безвозвратно

---

## Вопросы — нужны ответы перед запуском

1. **On-prem импорт исторического дампа Supabase** ещё нужен? (определяет, удаляем ли `ImportSupabaseDump.php`, `import-supabase-dump.sh`, `.sql`-дамп и README про дампы)
2. **Вариант 1 или 2** по группам D и E? Рекомендую 1 — теряем только бренд, не знания.
3. `**.lovable/plan.md**` — оставить старый план или перезаписать новым (этим)?

вариант с хирургией