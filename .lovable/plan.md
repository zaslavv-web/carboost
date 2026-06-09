# План: перевод продукта на английский + переключатель языков

## Объём

- **69 файлов** с русским текстом (`src/pages` + `src/components` + `src/data`).
- **~1772 строки** с локализуемыми фразами — лендинг, личный кабинет всех 5 ролей (Employee, Manager, HRD, Company Admin, Superadmin), админки, диалоги, ошибки.
- Сейчас в проекте **нет i18n-библиотеки**, все строки захардкожены в JSX.

## Технический подход

### 1. Подключаем `react-i18next`

Стандарт де-факто, ленивая загрузка namespace'ов, поддержка плюрализации, интерполяции, `Trans` для JSX внутри переводов. Альтернативы (`react-intl`, `lingui`) тяжелее и без выгоды под наш кейс.

```text
src/i18n/
├── index.ts              ← init i18next + detector
├── locales/
│   ├── ru/
│   │   ├── common.json   ← кнопки, статусы, общее
│   │   ├── auth.json     ← Login, Register, Reset
│   │   ├── landing.json  ← лендинг + Pricing
│   │   ├── dashboard.json← все RoleDashboard страницы
│   │   ├── career.json   ← CareerTrack, Passport, Positions
│   │   ├── hrd.json      ← HRD-аналитика, Tests, Scenarios
│   │   ├── admin.json    ← Users/Companies/Email/Gamification mgmt
│   │   ├── shop.json     ← Shop, Cart, Orders, ShopAdmin
│   │   ├── support.json  ← Support, Notifications
│   │   └── errors.json   ← локализованные ошибки бэка
│   └── en/  ← зеркало структуры
└── languages.ts          ← список языков, метаданные
```

### 2. Переключатель языка

- Компонент `<LanguageSwitcher />` в шапке (десктоп) и в мобильном drawer.
- Опции: **RU / EN** с флагами + кодами.
- Сохраняем выбор в `localStorage` (`ct-lang`) + `<html lang="...">`.
- Дефолт: определяем по `navigator.language`; если не EN/RU → RU (основной рынок).
- Synced для авторизованных пользователей: поле `users.locale` в БД (миграция), грузим при логине.

### 3. Миграция строк

Делается итеративно, **по группам файлов**, чтобы не сломать всё разом:

1. **Common UI** — кнопки, табы, статусы, валидации (`AppSidebar`, `AppLayout`, `MobileEmployeeLayout`, общие диалоги).
2. **Auth + лендинг** — `Login`, `ResetPassword`, `CompleteRegistration`, `Landing`, `Pricing`, `FeaturePage`, `DemoRequestDialog`.
3. **Employee** — `Dashboard`, `CareerTrack`, `Passport`, `Assessment`, `EmployeeQuestionnaire`, `Notifications`, `Recognition`, `Shop`, `Cart`, `MyOrders`.
4. **Manager + HRD** — `ManagerDashboard`, `HRDDashboard`, `Analytics`, `RiskAnalytics`, `HRDTests`, `Scenarios`, `HRPolicies`, `CareerReviews`, `HRDCareerTracksAnalytics`, `HRDEmployeeMap`.
5. **Admin / Superadmin** — `UsersManagement`, `Companies`, `Positions`, `CareerTracksManagement`, `EmailSettingsManagement`, `GamificationManagement`, `ShopAdmin`, `SuperadminDashboard`, `PricingInquiries`, `Invitations`, `Settings`, `Onboarding`.
6. **Данные-каталоги** — `src/data/features.ts`, `src/data/jobProfileTemplates.ts` (карточки фич/шаблонов — переводим, либо делаем `i18nKey` поля).
7. **Бэкенд-ошибки** — мапы локализации в `src/integrations/laravel/*` уже есть; добавляем EN-вариант, выбор по текущему языку.

### 4. Что **не** трогаем

- Имена/фамилии пользователей, названия компаний, контент, который ввёл сам пользователь (продукты магазина, треки, должности).
- Системные коды ролей (`employee`/`manager`/…) — только их подписи в UI.
- Технические логи и Laravel-сообщения сервера (там своя i18n).

### 5. Тестирование и поиск ошибок

После миграции каждой группы прогоняем:

- `bunx vitest run` — юнит-тесты (тесты с захардкоженным русским текстом обновляем на ключи).
- `bunx tsc --noEmit` — типобезопасность.
- **Визуальная проверка через preview** (browser-tools): по очереди для RU и EN
  - Лендинг, Pricing, Login.
  - Дашборд каждой из 5 ролей (логинимся под тест-аккаунтами или через Impersonation).
  - Ключевые формы: Onboarding, CompleteRegistration, EmployeeQuestionnaire, диалоги создания.
- Скрипт-аудит: `rg '[А-Яа-я]' -g '*.tsx' src` после переключения на EN не должен находить русский текст в рендере (кроме user-content и data-fixtures).
- Скрипт-аудит на отсутствующие ключи: i18next dev-mode логирует `missingKey` в консоль — собираем и закрываем.
- **Найденные баги (опечатки, обрывы строк, кривая вёрстка из-за длины EN-слов, незакрытые диалоги) — сразу фиксим**, отдельным коммитом в рамках той же группы.

### 6. Деплой

- Не публикуем, пока не пройдут все 7 групп + чек-листы RU/EN.
- В конце — единый smoke-run по всем ролям в обеих локалях, отчёт о найденном/исправленном.

## Оценка масштаба

Это самая большая правка с момента запуска. Реалистично — **5–7 итераций чата** (по 1–2 группе за раз), иначе не вытяну в один проход без обрывов. После каждой группы кратко отчитываюсь и иду дальше.

## Уточни перед стартом

1. **Английский — формальный (US business)** или нейтральный (UK)? По умолчанию возьму **US, формально-нейтральный** (HR-tech стандарт).
2. **Бренд-термины** оставляем как есть на обоих языках: `Career Track`, `Sandstorm`, названия ролей в UI — `Employee / Manager / HRD / Company Admin / Superadmin`. Подтверди.
3. **Сохранять выбор языка в БД** (поле `users.locale`, миграция) или только в `localStorage`? БД-вариант = язык переезжает между устройствами, но требует миграцию на проде. **Рекомендую localStorage сейчас + БД-поле позже**, если попросишь.
4. **Идти подряд группами 1→7** (как в плане) или сначала только лендинг + Login + Employee-дашборд (минимум для демо), а админки потом?

Жду ответов — и стартую с группы 1 (инфра i18n + Common UI).
