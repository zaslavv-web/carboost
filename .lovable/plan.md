# План: светлая тема + кастомизация бренда компании

## Часть 1. Переключение на светлую тему

Тоггл темы (`ThemeToggle`) уже есть в десктопном `AppLayout` (header). Он работает через `ThemeContext` + класс `.dark` на `<html>` и токены HSL в `src/index.css` (`:root` — светлая, `.dark` — тёмная). Не хватает только доступности на мобильной раскладке сотрудника и в боковом меню.

Что сделаю:
- Добавлю `ThemeToggle` в `MobileEmployeeLayout` (в шапку рядом с `Bell` и в выезжающее меню `Sheet`).
- Добавлю пункт «Тема: светлая/тёмная» в выпадающее меню пользователя в `AppSidebar` (footer профиля), чтобы переключатель был очевиден для HRD/руководителя.
- Подпишу тексты в `ru/common.json` и `en/common.json` (уже есть `theme.*`, проверю покрытие).
- Проверю, что во всех страницах используются семантические токены (`bg-background`, `text-foreground`, `bg-card`...). Если найду жёстко прописанные `text-white`/`bg-black`/`bg-[#...]` — заменю на токены (точечно, без переделки дизайна).

## Часть 2. Брендинг компании (логотип + фирменные цвета)

Идея: HRD / Company Admin загружает логотип и задаёт акцентный цвет (или система подбирает палитру из логотипа). Эти значения сохраняются на уровне компании и применяются к интерфейсу для всех её сотрудников — поверх базовой темы (светлой/тёмной).

### 2.1 База данных (Laravel migration)
Новая таблица `company_branding` (1:1 к `companies`):
- `company_id` (uuid, PK, FK → companies)
- `logo_url` (text, nullable) — URL логотипа в storage
- `logo_dark_url` (text, nullable) — опциональный вариант для тёмной темы
- `primary_hsl` (text, nullable) — `"H S% L%"`, основной акцент
- `primary_glow_hsl` (text, nullable) — производный/осветлённый
- `accent_hsl` (text, nullable)
- `sidebar_bg_hsl` (text, nullable) — опционально, тёмный/светлый фон сайдбара
- `auto_extracted` (bool, default false) — палитра подобрана из логотипа автоматически
- `updated_by` (uuid, nullable)
- `created_at` / `updated_at`

В `companies` дополнительно ничего не трогаем (`logo_url` там уже есть — мигрируем существующее значение в `company_branding.logo_url` при первом сохранении, поле в `companies` оставим для обратной совместимости).

### 2.2 Backend API (Laravel)
Новый `CompanyBrandingController`:
- `GET /api/companies/{id}/branding` — публично доступен внутри тенанта (любой авторизованный пользователь компании читает свой бренд).
- `PUT /api/companies/{id}/branding` — только `hrd`, `company_admin`, `superadmin` той же компании. Валидация: hex/HSL формата, размеры лого, безопасный URL.
- `POST /api/companies/{id}/branding/logo` — загрузка файла (PNG/JPG/SVG, ≤ 2 MB) в `storage/app/public/company-logos/{company_id}/...`, возвращает `logo_url`.

В `AuthController::me` (или ProfileController, в зависимости от текущей реализации) добавить `company_branding` в payload, чтобы фронт получал бренд за один запрос при логине.

### 2.3 Frontend — применение бренда

Новый файл `src/contexts/BrandingContext.tsx`:
- Загружает `company_branding` после авторизации (из `/me` или отдельным запросом, с кэшем TanStack Query, ключ — `company_id`).
- Записывает CSS-переменные в `document.documentElement.style`:
  - `--primary`, `--primary-glow`, `--ring`, `--sidebar-primary`, `--sidebar-ring`, `--gradient-primary`, `--shadow-elevated`, `--shadow-glow`, `--accent` — пересчитываются из `primary_hsl`.
  - При смене темы (`light` ↔ `dark`) переменные применяются заново (контекст подписывается на `ThemeContext`).
- При отсутствии брендинга — ничего не пишет, остаются дефолты из `index.css`.

Подключение: `<BrandingProvider>` оборачивает приложение внутри `AuthProvider`/`ThemeProvider` в `App.tsx`.

Логотип:
- В `AppSidebar` и `MobileEmployeeLayout` шапке: если `branding.logo_url` есть — показываем его вместо текстового бренда «Growth Peak» (с фолбэком на текст, alt = название компании).
- В тёмной теме используем `logo_dark_url`, если задан, иначе `logo_url`.

### 2.4 UI настройки бренда

Новая страница `src/pages/CompanyBranding.tsx` (роут `/company-branding`, доступ — `hrd`/`company_admin`/`superadmin`):
- Карточка «Логотип»: дроп-зона + предпросмотр в светлой и тёмной шапке. Отдельные поля для светлого/тёмного варианта.
- Карточка «Фирменный цвет»: color picker (HEX), live-предпросмотр кнопок/чипов/сайдбара. Опционально кнопка «Подобрать из логотипа» — на клиенте через canvas: средний доминирующий цвет (k-means по пикселям, без внешних либ).
- Кнопка «Сбросить к дефолту» — очищает поля в БД.
- Сохранение → инвалидирует `branding` query → весь интерфейс мгновенно подхватывает новые токены.

Ссылка на страницу добавляется в `AppSidebar` в группу «Настройки» только для ролей HRD / Company Admin / Superadmin.

### 2.5 Утилиты
- `src/lib/color.ts`: `hexToHsl`, `hslToCss`, `lighten`, `darken`, `getReadableForeground` (черный/белый по контрасту), `extractDominantColor(imageUrl)` через canvas.
- Тесты на `hexToHsl` и `getReadableForeground` (vitest).

## Технические детали

```text
App.tsx
└── ThemeProvider
    └── AuthProvider
        └── BrandingProvider  ← новый
            └── ImpersonationProvider
                └── Router / ChatProvider / Routes
```

Поток применения бренда:
```
login → /me → company_branding → BrandingProvider
   → useEffect: write CSS vars to :root
   → Tailwind токены (hsl(var(--primary))) автоматически окрашивают всё
```

Безопасность:
- RLS / Policy: чтение брендинга разрешено всем пользователям той же компании; запись — только ролям выше Employee.
- Загрузка файла: проверка mime-type на бэке, лимит 2 MB, имя файла рандомизируется.

Совместимость:
- Если у компании нет записи в `company_branding` — UI выглядит как сейчас (дефолт antique gold).
- Существующий `companies.logo_url` подтягивается в `company_branding.logo_url` при первом открытии страницы настроек (миграция данных не нужна, делаем lazy backfill в контроллере).

## Что НЕ входит в этот план

- Полноценный «AI brand kit» (несколько цветов из логотипа, шрифты, иконки) — пока только основной акцент + опциональный sidebar bg.
- Кастомные шрифты компании — оставляем Inter; добавим отдельной задачей при необходимости.
- Применение бренда на лендинге (`/`, `/pricing`) — там оставляем фирменный стиль Growth Peak.
