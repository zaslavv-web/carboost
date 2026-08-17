# SCORM-загрузка в Корпоративный университет

## Текущее состояние

SCORM-поддержки в коде сейчас нет. LMS-модуль (Корпоративный университет) реализован: есть курсы, модули, уроки, записи, прогресс и сертификаты. Файловое хранилище работает через `StorageController` с бакетами. Это значит, загрузку SCORM можно встроить в существующую архитектуру, не ломая её.

## Цель

Добавить возможность загружать SCORM-пакет (ZIP) прямо из каталога курсов (`/university`). После загрузки система автоматически:
- распаковывает пакет;
- парсит `imsmanifest.xml`;
- создаёт курс с модулями/уроками;
- запускает контент в iframe через SCORM Runtime API;
- собирает прогресс (cmi) и пишет его в БД.

## Что будет реализовано

### 1. Backend — загрузка и импорт

Новый `ScormController` с endpoint'ами:
- `POST /university/scorm/upload` — приём ZIP до 100 МБ, валидация, распаковка.
- `POST /university/scorm/import` — парсинг манифеста и создание курса.
- `GET /university/scorm/{courseId}/launch/{lessonId}` — URL для iframe.
- `POST /university/scorm/{enrollmentId}/cmi` — сохранение cmi-данных от SCORM API.
- `GET /university/scorm/{enrollmentId}/cmi` — восстановление сессии при повторном открытии.

Алгоритм импорта:
1. ZIP сохраняется в приватный бакет `scorm-packages` (`storage/app/private/scorm-packages/{company_id}/{uuid}/package.zip`).
2. Распаковывается в ту же папку.
3. Находится `imsmanifest.xml`, определяется версия: SCORM 1.2 (`<schemaversion>1.2</schemaversion>`) или SCORM 2004 (`<schemaversion>2004 ...</schemaversion>`).
4. По манифесту строится дерево организаций → элементов `<item>` → ресурсов.
5. Создаётся курс (`courses`) с `source_type = 'scorm'`, `scorm_package_path = ...`, `scorm_version = '1.2' | '2004'`.
6. Для каждого `<item>` с ресурсом создаётся модуль + урок типа `scorm` с `launch_url` относительно распакованного пакета.

### 2. Хранилище

В `config/filesystems.php` добавляется диск `scorm-packages` (приватный). В `StorageController::BUCKETS` регистрируется бакет `scorm-packages` → `[disk: 'scorm-packages', public: false]`.

ZIP и распакованные файлы хранятся приватно. Для открытия в iframe контроллер отдаёт временный signed URL или проксирует файл через `ScormController::asset()`, проверяя enrollment пользователя.

### 3. База данных (миграция)

Новая миграция добавляет:
- В `courses`:
  - `source_type` string(16) default 'native' — native | scorm
  - `scorm_version` string(16) nullable — 1.2 | 2004
  - `scorm_package_path` string nullable — путь к распакованному пакету
  - `scorm_manifest` json nullable — кешированный манифест
- В `lessons`:
  - расширить `type` до `video|markdown|pdf|test|scorm`
  - `launch_url` string nullable — относительный путь внутри пакета
- Новая таблица `scorm_runtime_data`:
  - `id` bigIncrements
  - `enrollment_id` uuid index
  - `lesson_id` uuid
  - `cmi_key` string(255) — например `cmi.core.lesson_status`
  - `cmi_value` text
  - timestamps
  - unique `[enrollment_id, lesson_id, cmi_key]`

### 4. Frontend — каталог курсов

На странице `University.tsx` у авторов (`hr`, `hrd`, `company_admin`, `superadmin`) рядом с кнопкой «Создать курс» добавляется «Загрузить SCORM».

Модальное окно `ScormUploadDialog`:
- Drag-and-drop ZIP.
- Индикатор загрузки.
- После успеха — редирект на `/university/{courseId}/edit` с тостом «SCORM-курс импортирован».

### 5. Просмотр SCORM-урока

В `CourseView.tsx` для урока типа `scorm` вместо markdown/видео рендерится iframe:
- `src = /university/scorm/{courseId}/launch/{lessonId}`.
- Iframe с `sandbox="allow-scripts allow-same-origin"`.
- Перед загрузкой SCORM-контента в iframe внедряется скрипт-адаптер (`scorm-api-adapter.js`), который:
  - создаёт `window.API` для SCORM 1.2;
  - создаёт `window.API_1484_11` для SCORM 2004;
  - перехватывает `LMSInitialize`, `LMSSetValue`, `LMSGetValue`, `LMSFinish` (или 2004-эквиваленты);
  - постит изменения в `POST /university/scorm/{enrollmentId}/cmi`;
- При `LMSFinish` / `Terminate` фронт вызывает `POST /university/enrollments/{id}/progress` для обновления `lesson_progress` и статуса курса.

### 6. Отслеживание прогресса

`ScormController::storeCmi`:
- Принимает JSON с cmi key-value.
- Сохраняет/обновляет записи в `scorm_runtime_data`.
- Если `cmi.core.lesson_status` (1.2) или `cmi.completion_status` (2004) становится `completed`/`passed`, отмечает урок пройденным в `lesson_progress`.
- Если все уроки курса пройдены — обновляет `enrollments.status` на `completed`, выдаёт сертификат (используется существующая логика `EnrollmentController`).

### 7. Безопасность и ограничения

- ZIP валидируется на расширение и MIME `application/zip`.
- Максимальный размер — 100 МБ (отдельный лимит в `ScormController`).
- Распаковка через `ZipArchive` с проверкой path traversal (`../` в именах файлов отбрасываются).
- Только авторы/HRD/админы могут загружать.
- SCORM-файлы отдаются только записанным на курс пользователям или авторам.
- iframe sandbox без `allow-top-navigation`, чтобы пакет не мог редиректить пользователя.

## Порядок реализации

1. Миграция БД + обновление `config/filesystems.php`.
2. `ScormController` + маршруты в `routes/api.php`.
3. Обновление `StorageController::BUCKETS`.
4. Frontend: `ScormUploadDialog`, кнопка в `University.tsx`.
5. Frontend: адаптер `scorm-api-adapter.js` и поддержка типа `scorm` в `CourseView.tsx`.
6. Тестовый прогон на боевом сервере с простым SCORM 1.2 пакетом.

## Что нужно от вас

- Подтвердите лимит размера пакета (предлагаю 100 МБ).
- Нужна ли авторасстановка модулей по `<organization>` из манифеста, или достаточно плоского списка уроков?
- Где хранить cmi-данные: в отдельной таблице (план выше) или в JSON-поле `lesson_progress.cmi_data`?