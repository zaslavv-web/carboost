# rtfm_automation — Автоматизации и авто-назначения

> Статус: **каркас (stage 1)**. Код: `backend-laravel/app/Services/Automation/*`.

## 1. Назначение
Фоновые правила: авто-назначение курсов и шагов трека, авто-эскалации по рискам, автозакрытие задач, генерация напоминаний, пересчёт целей. Работает как queue worker + scheduler.

## 2. Переменные окружения

| KEY | Обязат. | Описание | Пример |
|---|---|---|---|
| `QUEUE_CONNECTION` | да | Драйвер очереди | `redis` |
| `AUTOMATION_ENABLED` | нет | Глобальный kill-switch | `1` |
| `AUTOMATION_DRY_RUN` | нет | Только логировать, не писать | `0` |

## 3. Инфопотоки

```text
Scheduler (minute) ──► AutomationService::tick() ──► rules ──► queue(automation)
Queue worker ──► *ActionJob ──► PG (assignments/notifications/webhooks)
                          │
                          └─► emit event ──► services/notifications
```

## 4. Связь с ядром
- Читает: `career_track_templates`, `employee_career_assignments`, `positions`, `employee_risk_scores`.
- Пишет: `employee_career_assignments`, `hr_tasks`, `notifications`.
- События: публикует `CourseAutoAssigned`, `RiskEscalated`.

## 5. Публичные эндпоинты (админские)
| Метод | Путь | Роли | Описание |
|---|---|---|---|
| GET  | `/api/automation/rules` | Admin | Список правил |
| POST | `/api/automation/rules` | Admin | Создать правило |
| PATCH| `/api/automation/rules/{id}` | Admin | Изменить |
| POST | `/api/automation/run` | Admin | Ручной запуск |

## 6. Запуск локально
```bash
php artisan queue:work --queue=automation
php artisan schedule:work
```

## 7. Тесты
`core/tests/Feature/AutomationServiceTest.php`.
