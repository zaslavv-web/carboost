## Изменения в `src/components/landing/LandingHeader.tsx`

1. **Убрать дубликат в RU**: сейчас рендерим `brand.name` + `brand.subtitle`. В русской версии оба = «Пик Роста» → две одинаковые строки. Уберу рендер `subtitle` совсем — оставлю только `brand.name`. В EN подпись и так была пустой, так что визуально ничего не теряем.
2. **Очистить `brand.subtitle` в `src/i18n/locales/ru/common.json`** (или удалить ключ) — больше не нужен.
3. **Вертикальное центрирование названия с логотипом**: убрать обёртку `<div class="leading-tight">` с двумя `<span>` и заменить на одиночный `<span>` рядом с `<img>`. Контейнер `<Link>` уже `flex items-center gap-3`, так что одна строка автоматически отцентруется по высоте 36px-логотипа.

## Затронутые файлы
- `src/components/landing/LandingHeader.tsx`
- `src/i18n/locales/ru/common.json`

Без изменений в `Landing.tsx`, темах и других компонентах.
