## Что меняем

Лендинг (`src/pages/Landing.tsx` + `src/data/features.ts` + `src/i18n/locales/{ru,en}/landing.json`) перепозиционируем с «AI-оценка и треки» на **«Единая HR-tech ОС полного цикла сотрудника»** и подтягиваем все модули, появившиеся за последние итерации.

## Новое позиционирование

- **H1:** «Операционная система карьеры и людей»
- **Подзаголовок:** от найма и адаптации — до карьеры, обучения, перформанса, признания и отпусков. Один продукт вместо 5+ инструментов.
- **Опорные тезисы:** AI-ассистент в каждом шаге · мульти-тенант с ролями · работает on-premise (Docker/nginx) · 5 ролей из коробки.

## Новые фичи в каталоге

Расширяем `FEATURES` с 6 до 12 слагов. Добавляем:

| slug | Икона | Назначение |
|---|---|---|
| `performance` | LineChart | Цели, OKR, ревью, дисциплина |
| `leaves` | Calendar | Отпуска, переработки, баланс |
| `recognition` | Award | Признание коллег + лента |
| `university` | GraduationCap | Курсы, тесты, сертификаты |
| `shop` | ShoppingBag | Магазин на лояльные баллы |
| `hr-policies` | BookOpen | Политики, дисциплинарные процедуры |
| `internal-chat` | MessagesSquare | Внутренние чаты компании |
| `rag-ai` | Brain | RAG-документы и AI-ассистент HRD |
| `scenarios` | GitBranch | Сценарии оценки (React Flow) |
| `org-structure` | Network | Оргструктура с AI-парсингом |

Сохраняем существующие: `ai-assessment`, `career-tracks`, `gamification`, `analytics`, `digital-passport`, `onboarding`.

## Новый блок Pains

Расширяем `PAIN_KEYS` (было 6, станет 9): добавляем `vacation` (хаос с отпусками), `performance` (не понятно, кто буксует), `knowledge` (документы по HR разбросаны), `recognition` (никто не благодарит), `learning` (обучение не привязано к карьере). Убираем дубли.

## Новые роли в Stories

К `hrd / manager / lead` добавляем:
- `employee` — «увидел свой путь и баллы» → features: `digital-passport`, `career-tracks`, `shop`
- `admin` — Company Admin: «настроил компанию за день» → features: `org-structure`, `hr-policies`, `internal-chat`

## Визуальный редизайн (locked taste)

Палитра, типографика и layout зафиксированы из ответов пользователя:
- Palette: **Ocean Deep** — `#0c2340 / #1a4a6e / #2d8a9e / #5cbdb9`
- Type: **Urbanist (heading) + Epilogue (body)**
- Layout: **magazine** — featured story + сетка карточек

Я сгенерирую **3 design directions** для нового hero+features+stories блока с этими токенами как hard constraint (различаются плотностью, ритмом и motion-регистром), затем покажу превью и попрошу выбрать одно. После выбора:

1. Подключаю Urbanist/Epilogue через Google Fonts в `index.html` + `tailwind.config.ts`.
2. Обновляю `index.css`: токены `--primary / --info / --background / --foreground` и градиенты под Ocean Deep (HSL).
3. Переписываю `src/pages/Landing.tsx` под выбранную композицию (magazine: hero → featured pain story → bento фич → role-switcher → comparison «вместо 5 инструментов» → FAQ → CTA).
4. Расширяю `src/data/features.ts` (10 новых иконок и слагов, новые роли/боли).
5. Дописываю `src/i18n/locales/ru/landing.json` и `src/i18n/locales/en/landing.json` для всех новых ключей + новый hero/positioning copy.
6. SEO: обновляю `index.html` `<title>` и `meta description` под новое позиционирование.

## Что НЕ трогаем

- Логику аутентификации, роутинг, защищённые роуты.
- Дашборды и внутренние страницы (`/dashboard` и далее).
- Backend, миграции, RLS.

## После плана

1. `design--create_directions` с описанием и locked-токенами.
2. `ask_questions` (type `prototype`) — пользователь выбирает 1 из 3.
3. Реализация по выбранному направлению.
