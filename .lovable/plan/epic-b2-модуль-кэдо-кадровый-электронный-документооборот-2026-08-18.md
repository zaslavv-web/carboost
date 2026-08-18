# Epic B2. Модуль КЭДО (кадровый электронный документооборот)

Строим по той же схеме, что и B1 (1С): миграция → контроллер → маршруты → API-клиент → страница + пункт меню.

## Что получит пользователь

**Шаблоны документов (B2.1)**
- Библиотека шаблонов кадровых документов (приказы о приёме/переводе/увольнении, отпуска, командировки, НДФЛ-заявления, ознакомления с ЛНА и т.д.).
- Стартовый набор 30+ системных шаблонов подгружается автоматически при первом входе компании; HR может копировать, редактировать и создавать свои.
- Плейсхолдеры вида `{{employee.full_name}}`, `{{position.title}}`, `{{date}}` подставляются из карточки сотрудника при формировании документа.

**Документы и подписание (B2.2)**
- Создание документа из шаблона на одного или нескольких сотрудников (по сотруднику / отделу / подразделению / компании — как в OKR).
- ПЭП: подписание одноразовым кодом (код показывается/отправляется на почту), фиксируется IP, user-agent, время, хэш документа.
- УКЭП: подпись загружается как открепленный файл (.sig) с реквизитами сертификата; поле для провайдера (Диадок/Нобель) под будущую интеграцию.
- Статусы: черновик → на подписании → подписан → отклонён → аннулирован. Отклонение с причиной.

**Маршруты согласования (B2.4)**
- Визуальный конструктор маршрута: последовательные шаги, на каждом — участник (конкретный сотрудник, роль или руководитель), тип действия (согласование / подписание / ознакомление), срок.
- Маршрут привязывается к шаблону, документ движется по шагам автоматически.

**Юридическое хранение (B2.5)**
- Каждое событие документа пишется в неизменяемый журнал с hash chain (`prev_hash` + `hash`), проверка целостности одной кнопкой.
- Срок хранения (по умолчанию 75 лет) хранится у документа, удаление подписанных документов запрещено.

**ГИС ЭДО (B2.3)** — на этом этапе только каркас: настройки подключения (СФР/ФНС), выгрузка пакета документов и журнал отправок; реальный обмен подключим после выбора партнёра.

**Кабинет сотрудника**
- Раздел «Мои документы»: список на подпись/ознакомление, просмотр, подписание кодом, история. Работает и на мобильной версии.

## Техническая часть

**Миграция** `0037_00_00_000000_create_kedo_tables.php`
- `kedo_templates` (company_id, code, title, category, body_html, placeholders json, requires_signature, signature_kind, is_system, is_active)
- `kedo_routes` + `kedo_route_steps` (step_order, actor_type: user|role|manager, actor_ref, action: approve|sign|acknowledge, due_days)
- `kedo_documents` (company_id, template_id, route_id, user_id, title, body_html, status, current_step, retention_until, file_path, created_by)
- `kedo_document_participants` (document_id, user_id, step_order, action, status, acted_at, comment)
- `kedo_signatures` (document_id, user_id, kind: pep|ukep, otp_hash, cert_subject, cert_serial, sig_path, ip, user_agent, doc_hash, signed_at)
- `kedo_events` (document_id, actor_id, event, payload json, prev_hash, hash, created_at) — hash chain
- `kedo_edo_connections` + `kedo_edo_dispatches` (каркас ГИС ЭДО)
- Индексы по `company_id`, `document_id`, `user_id`.

**Backend** `app/Http/Controllers/Api/KedoController.php`
- Только raw `DB::table` + чанковое чтение (как в `DbController`/`ProfileController`) — Eloquent-гидрация запрещена из-за прошлых 500 по памяти.
- Методы: templates CRUD + `seedSystemTemplates`, routes CRUD, documents index/store/show/bulkCreate, `requestOtp`, `signPep`, `signUkep` (upload), `approve`, `reject`, `acknowledge`, `verifyChain`, `edoConnections`, `dispatch`.
- Доступ: HR/HRD/company_admin/superadmin — управление; сотрудник — только свои документы. Проверка company_id через `->companyId()`.
- Все выборки с лимитами и бюджетом ответа, без выгрузки `body_html` в списках.

**Routes** — блок `/kedo/*` в `backend-laravel/routes/api.php` рядом с talent-review.

**Frontend**
- `src/integrations/laravel/kedo.ts` — типизированный клиент.
- `src/pages/Kedo.tsx` — вкладки: Документы, Шаблоны, Маршруты, ЭДО, Журнал целостности.
- `src/components/kedo/RouteBuilder.tsx` — визуальный конструктор шагов.
- `src/components/kedo/SignDialog.tsx` — ПЭП-код и загрузка УКЭП.
- `src/pages/employee/MyDocuments.tsx` + пункт в мобильном меню сотрудника.
- Регистрация маршрутов в `src/App.tsx`, пункты «КЭДО» и «Мои документы» в `src/components/AppSidebar.tsx` с учётом ролей.

**Выкат**: `git pull origin main` + `php artisan migrate` + сброс кэшей; проверка `/api/health` и боевой прогон подписания под HRD-учёткой.

## Что не входит в этот этап
- Реальная криптопроверка УКЭП на сервере (нужен КриптоПро/партнёрский API) — сохраняем подпись и реквизиты, валидацию добавим после подключения провайдера.
- Живой обмен с СФР/ФНС — только каркас и журнал.
