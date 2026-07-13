# rtfm_web — SPA (React + Vite)

> Статус: **каркас (stage 1)**. Код физически ещё в корне: `src/`, `index.html`, `vite.config.ts`, `public/`, `package.json`. Переезд в `apps/web/` — stage 2 плана.

## 1. Назначение
Single-page-application для 5 ролей (Employee / Manager / HRD / Company Admin / Superadmin) + публичный лендинг. Ходит на core-API через `src/integrations/laravel/client.ts` и в Supabase (Lovable Cloud) через `src/integrations/supabase/client.ts` (автоген).

## 2. Переменные окружения (build-time, VITE_*)

| KEY | Обязат. | Описание | Пример |
|---|---|---|---|
| `VITE_LARAVEL_API_URL` | да | База core-API | `/api` |
| `VITE_SUPABASE_URL` | да | URL Lovable Cloud | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | да | anon-ключ | `eyJhbGci...` |
| `VITE_SUPABASE_PROJECT_ID` | да | Ref проекта | `wwmd...` |
| `VITE_REVERB_KEY` | нет | Публичный ключ Reverb | `pk_...` |
| `VITE_REVERB_HOST` | нет | Хост Reverb | `ws.growth-peak.pro` |
| `VITE_REVERB_PORT` | нет | Порт | `443` |
| `VITE_REVERB_SCHEME` | нет | http/https | `https` |

**Важно:** `VITE_*` вшиваются в бандл на этапе `bun run build`. Значит билд запускается на сервере (или в CI, куда переменные проброшены секретами), а не по локальному `.env` из git.

## 3. Инфопотоки

```text
Browser ──HTTPS──► nginx ──► dist/ (статик)
Browser ──/api/*──► nginx ──► core (Laravel)
Browser ──/api/ai/assessment-chat──► SSE ──► services/ai
Browser ──WSS──► services/chat (Reverb)
Browser ──HTTPS──► Lovable Cloud (Supabase auth/storage)
```

## 4. Связь с ядром
- Единственная точка доступа: `src/integrations/laravel/{client,auth,db,rpc,storage,chat,realtime,leaves,performance,geo}.ts`.
- Токен Sanctum — `localStorage.laravel_token`, менеджится `LaravelAuthContext`.
- Никакой прямой работы с БД из фронта; всё через core-эндпоинты.

## 5. Публичные маршруты фронта
`/`, `/login`, `/register`, `/dashboard`, `/employee/*`, `/manager/*`, `/hrd/*`, `/admin/*`, `/superadmin/*`, `/investor-deck`, `/chat`, `/shop`, `/tracker/*`.

## 6. Запуск локально
```bash
bun install
bun dev             # http://localhost:8080
bun run build       # dist/
bun test            # vitest
bunx tsgo --noEmit  # тайпчек
```

## 7. Тесты
Vitest (`src/test/`, `src/**/__tests__`), Playwright (`src/e2e/`, `playwright.config.ts`).
