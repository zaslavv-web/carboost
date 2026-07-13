# rtfm_ingest — Импорт данных, парсинг, GeoIP, Storage

> Статус: **каркас (stage 1)**.

## 1. Назначение
Импорт HR-документов, оргструктуры (Excel/CSV/PDF), нормализация должностей, geo-lookup для auth, работа с файловым Storage (локальный disk / S3-совместимый Selectel).

## 2. Переменные окружения

| KEY | Обязат. | Описание | Пример |
|---|---|---|---|
| `FILESYSTEM_DISK` | да | `local` / `s3` | `local` |
| `AWS_ACCESS_KEY_ID` | если s3 | Ключ | `...` |
| `AWS_SECRET_ACCESS_KEY` | если s3 | Секрет | `...` |
| `AWS_BUCKET` | если s3 | Бакет | `growthpeak` |
| `AWS_ENDPOINT` | если s3 | Endpoint | `https://s3.storage.selcloud.ru` |
| `AWS_DEFAULT_REGION` | если s3 | Регион | `ru-1` |
| `GEOIP_DB_PATH` | нет | Путь к MaxMind mmdb | `/var/lib/geoip/GeoLite2-City.mmdb` |
| `INGEST_MAX_UPLOAD_MB` | нет | Лимит аплоада | `50` |

## 3. Инфопотоки

```text
SPA ──POST /api/storage/upload──► StorageController ──► disk(local|s3)
SPA ──POST /api/hr-documents/parse──► HrDocumentController ──► DocumentParserService (AI)
                                                                       │
                                                                       └─► HR-tables (positions, departments)
SPA ──GET /api/geo──► GeoController ──► GeoIpService ──► MaxMind DB
```

## 4. Связь с ядром
- Пишет: `hr_documents`, `positions`, `departments`, `employee_questionnaires`.
- Читает: `companies` (для company_id-скоупа).
- Вызывает services/ai для парсинга блоков.

## 5. Публичные эндпоинты
| Метод | Путь | Роли | Описание |
|---|---|---|---|
| POST | `/api/storage/upload` | authenticated | Загрузка файла |
| GET  | `/api/storage/{path}` | authenticated | Скачать |
| POST | `/api/hr-documents` | HRD, Admin | Загрузить и распарсить |
| POST | `/api/hr-documents/{id}/parse` | HRD, Admin | Повторный парсинг |
| POST | `/api/org-structure/import` | Admin | Импорт оргструктуры |
| GET  | `/api/geo` | public | GeoIP + доступные способы входа |

## 6. Запуск локально
Внутри core.

## 7. Тесты
`core/tests/Feature/StorageControllerTest.php`.
