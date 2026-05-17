# Career Track — Структура базы данных

Полное описание схемы MySQL (49 таблиц). Используется в Laravel-бэкенде (`backend-laravel/`), миграции лежат в `database/migrations/0002_00_*`.

---

## 🔐 Блок 1. Аутентификация и пользователи

### `users` — аккаунты для входа
Стандартная Laravel/Sanctum-таблица. **Только креды**, без бизнес-данных.
| Колонка | Назначение |
|---|---|
| `id` (uuid, PK) | Идентификатор пользователя |
| `email` (unique) | Логин |
| `password` | bcrypt-хеш (для OAuth = NULL) |
| `email_verified_at` | Подтверждение email |
| `meta` (json) | Данные OAuth (Google id, avatar) |
| `remember_token` | "Remember me" |

### `profiles` — профиль сотрудника (1:1 к users)
Все **бизнес-данные** о человеке. Связь по `user_id` → `users.id`.
| Колонка | Назначение |
|---|---|
| `user_id` (unique) | Связь с users |
| `full_name`, `avatar_url`, `position`, `department`, `hire_date` | Анкета |
| `company_id` | Компания (мультитенант) |
| `position_id` | Текущая должность (FK → positions) |
| `pending_position_id` | Желаемая должность (для карьерного трека) |
| `is_verified` | Верифицирован суперадмином |
| `requested_role` | Роль, запрошенная при регистрации |
| `overall_score`, `role_readiness` | Метрики для дашбордов |

### `user_roles` — роли (источник истины)
Отдельная таблица, чтобы избежать privilege-escalation. Один user — несколько ролей.
| Колонка | Значения |
|---|---|
| `role` | `employee` / `manager` / `hrd` / `company_admin` / `superadmin` |

### `personal_access_tokens` — Sanctum-токены API
Хранит SPA-токены, выданные `User::createToken()`.

### `sessions`, `cache`, `jobs` — служебные Laravel-таблицы

### `roles`, `permissions`, `model_has_roles`, `model_has_permissions`, `role_has_permissions` — Spatie Permission
Используется middleware `role:hrd` и т.п. **Дублирует `user_roles`** для совместимости с пакетом.

### `impersonation_audit` — лог входов "под пользователем"
Когда суперадмин логинится как обычный юзер — пишется сюда.

---

## 🏢 Блок 2. Компании и оргструктура

### `companies` — арендаторы (tenants)
| `id`, `name`, `description`, `logo_url` |

### `departments` — отделы (дерево)
| `parent_id` — иерархия | `head_user_id` — руководитель | `company_id` |

### `positions` — должности
Каталог ролей в компании (например, "Junior Frontend", "Тимлид"). Используется в `profiles.position_id`, `career_track_templates`, `closed_question_tests`.

### `position_career_paths` — связь должностей (граф карьеры)
Для React Flow визуализации. `from_position_id` → `to_position_id`.

### `email_domain_position_mappings` — авто-назначение должности по домену
При регистрации `ivan@acme.com` → должность "Менеджер Acme".

### `team_members` — связь менеджер ↔ сотрудник
| `manager_id` | `employee_id` |

---

## 🎯 Блок 3. Карьерные треки

### `career_track_templates` — шаблон трека (от должности к должности)
| `from_position_id` → `to_position_id` | `steps` (jsonb) | `motivation_text` | `estimated_months` |

### `career_level_actions` — действия внутри уровня шаблона
| `template_id` | `action_text` | `action_order` | `category` |

### `career_step_scenarios` — настройки шага трека
Что требуется на шаге: файлы, тест, комментарий, минимальный балл.
| `template_id` | `step_order` | `requires_files` | `requires_test` | `min_test_score` | `requires_comment` |

### `employee_career_assignments` — назначенный трек сотруднику
| `user_id` | `template_id` | `current_step` | `status` | `personal_motivation` |

### `career_step_submissions` — сдача шага сотрудником
| `assignment_id` | `step_order` | `status` (pending_review/approved/rejected) | `comment` | `attempt_no` |

### `career_step_submission_files` — файлы к сдаче
| `submission_id` | `file_url` | `file_name` |

### `career_goals` + `goal_checklist_items` — цели и чек-листы
Свободные цели сотрудника (не из шаблона). `auto_generated` = создано из шаблона.

---

## 📋 Блок 4. Опросы и тесты

### `employee_questionnaires` — анкета компетенций сотрудника
| `answers` (jsonb) | `skill_gaps` (jsonb) | `ai_interpretation` (jsonb) | `status` (draft/submitted/confirmed) |

### `employee_questionnaire_files` — приложения к анкете

### `closed_question_tests` — тесты с закрытыми вопросами
| `questions` (jsonb) | `position_id` — для какой должности |

### `test_attempts` — попытки прохождения тестов
| `test_id` | `user_id` | `score` | `answers` |

### `assessments` — ассессменты (AI-оценки)
| `assessment_type` (ai) | `score` | `assessment_data` (jsonb) |

### `assessment_scenarios` — сценарии для AI-ассессмента
JSON со сценарием диалога, нодами, ветвлениями (React Flow).

### `competencies` — навыки сотрудника
| `user_id` | `skill_name` | `skill_value` (0-100) |

### `achievements` — достижения сотрудника
| `title` | `icon` | `achievement_date` |

---

## 💰 Блок 5. Геймификация и валюта

### `company_currency_settings` — настройки внутренней валюты компании
| `currency_name` ("Монеты") | `currency_icon` ("🪙") |

### `currency_balances` — баланс сотрудника
| `user_id` | `company_id` | `balance` |

### `currency_transactions` — история начислений/списаний
| `kind` (earn/spend/admin_adjust) | `amount` | `reference_id` | `description` |

### `gamification_reward_types` — типы наград
| `category` | `points` | `trigger_mode` (manual/auto) | `trigger_events` (jsonb) | `monetary_amount` / `non_monetary_title` |

### `employee_rewards` — выданные награды
| `user_id` | `reward_type_id` | `awarded_by` | `awarded_at` |

### `peer_recognitions` — благодарности от коллег
| `from_user_id` | `to_user_id` | `message` |

### `peer_recognition_reactions` — реакции (лайки)
| `recognition_id` | `user_id` | `emoji` |

---

## 🛒 Блок 6. Магазин (за внутреннюю валюту)

### `shop_products` — товары
| `title` | `price` | `image_url` | `stock` |

### `shop_cart_items` — корзина пользователя

### `shop_orders` + `shop_order_items` — заказы

---

## 🎫 Блок 7. HR-инструменты

### `hr_tasks` + `hr_task_assignees` — HR-задачи
Например: "Заполнить анкету до пятницы". Many-to-many через `hr_task_assignees`.
| `individual_status` (open/in_review/done) | `reward_paid` |

### `hr_documents` — загруженные HR-документы
| `document_type` | `processing_status` (pending/done) | `extracted_data` (jsonb — после AI-парсинга) |

### `support_tickets` — обращения в поддержку
| `subject` | `message` | `status` | `ai_suggested_fix` |

### `employee_invitations` — приглашения новых сотрудников
| `token` (уникальный) | `email` | `position_id` | `requested_role` | `claimed_at` |

### `employee_risk_scores` — оценка рисков (HRD-аналитика)
| `engagement_score` | `burnout_risk` | `attrition_risk` | `risk_level` | `factors` (jsonb) | `recommendations` (jsonb) |

### `company_onboarding_settings` — настройки онбординга
| `welcome_bonus_amount` | `auto_assign_tracks` | `auto_assign_tests` |

### `notifications` — уведомления внутри приложения
| `user_id` | `type` | `title` | `body` | `read_at` |

---

## 📢 Блок 8. Лендинг и продажи

### `demo_requests` — заявки на демо с лендинга
| `name` | `email` | `company` | `headcount` | `status` |

### `pricing_inquiries` — запросы цен

---

## 🔗 Ключевые связи (логические FK)

```
users (1) ──── (1) profiles ──── (N) user_roles
                    │
                    ├──→ companies
                    └──→ positions ──→ position_career_paths
                                    └─→ career_track_templates
                                            │
                                            ├─→ career_level_actions
                                            ├─→ career_step_scenarios ──→ closed_question_tests
                                            └─→ employee_career_assignments
                                                    └─→ career_step_submissions ──→ career_step_submission_files

profiles ──→ team_members (как manager/employee)
         ──→ competencies, achievements, assessments, career_goals
         ──→ currency_balances ──→ currency_transactions
         ──→ employee_rewards ──→ gamification_reward_types
         ──→ shop_cart_items, shop_orders ──→ shop_order_items ──→ shop_products
         ──→ hr_task_assignees ──→ hr_tasks
         ──→ notifications, support_tickets
         ──→ peer_recognitions ──→ peer_recognition_reactions
         ──→ employee_questionnaires ──→ employee_questionnaire_files
         ──→ test_attempts ──→ closed_question_tests
         ──→ employee_risk_scores
```

---

## 🛡 RLS / Policies

В Supabase это были Postgres RLS. В Laravel перенесены в **Policies** (`app/Policies/`) + middleware `EnsureHasCompany`, `EnsureVerified`. Принцип:

- **employee** — видит только свои данные (`user_id = auth.id`)
- **manager** — + данные подчинённых через `team_members`
- **hrd** / **company_admin** — всё в рамках своей `company_id`
- **superadmin** — глобальный доступ

Все запросы автоматически фильтруются по `company_id` (см. `CompanyScopedPolicy`).

---

## 🆕 Правило для новых изменений

Каждое изменение схемы — **новая миграция** (даже одно поле). Не редактировать существующие `0002_00_*` файлы. Пример:

```php
// 0003_00_01_000000_add_phone_to_profiles.php
if (Schema::hasTable('profiles') && !Schema::hasColumn('profiles', 'phone')) {
    Schema::table('profiles', function (Blueprint $t) {
        $t->string('phone', 32)->nullable();
    });
}
```
