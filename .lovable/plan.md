## Диагноз

`positions.created_by` на проде NOT NULL и без дефолта. Наша миграция `0030_00_04` его не трогала (она чинила `hr_documents.created_by` и `career_track_templates.created_by`). Сидер передавал `null` → падение до вставки первой позиции.

Транзакция откатилась целиком — БЮ и 30 отделов **не остались** в базе. Проверять/чистить ничего не надо, повторный запуск без `--reset` пройдёт с чистого листа.

## Фикс (одним патчем в `backend-laravel/app/Console/Commands/SeedOrg150.php`)

Использовать `id` владельца компании (`growthpeak@yandex.ru`) как `created_by` для всех создаваемых позиций.

1. В `resolveCompanyId()` дополнительно вернуть `ownerUserId`:
   - изменить сигнатуру на возврат массива `[$companyId, $ownerUserId]`.
   - брать `users.id` того же owner email.
   - при указании `--company-id` — тянуть любой company_admin/hrd этой компании, иначе первого юзера компании; если и такого нет — `null` и предупредить.
2. Сохранить `$this->ownerUserId` в поле класса.
3. В `createPositions()`, внутри `$mkPosition`, вместо `$row['created_by'] = null;` ставить `$row['created_by'] = $this->ownerUserId;` (только если колонка `created_by` существует).
4. Ничего больше не трогаем — остальной поток уже проверен dry-run'ом.

## Порядок действий на сервере

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
git pull
php artisan org:seed-150 --owner-email=growthpeak@yandex.ru --dry-run
php artisan org:seed-150 --owner-email=growthpeak@yandex.ru
ls -la storage/app/demo-seed-150-*.csv
head -5 storage/app/demo-seed-150-*.csv
```

Ожидание: 4/4 шагов зелёные, CSV на 150 строк.

## Почему НЕ через миграцию

- `positions.created_by NOT NULL` — это осмысленное ограничение (кто создал позицию); ослаблять его миграцией на прод-схеме нежелательно.
- Простой автор-владелец решает задачу и совместим с реальными сценариями (созданное показывается в UI под аккаунтом growthpeak@yandex.ru).

После апрува — реализую фикс и жду результат `php artisan org:seed-150`.
