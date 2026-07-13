# rtfm_gamification — Геймификация, магазин наград, лояльность

> Статус: **каркас (stage 1)**.

## 1. Назначение
Уровни, ачивки, внутренняя валюта, магазин наград, peer-recognition. Начисления и списания баллов по правилам за завершение шагов трека, прохождение оценок, инициативы.

## 2. Переменные окружения

| KEY | Обязат. | Описание | Пример |
|---|---|---|---|
| `GAMIFICATION_ENABLED` | нет | Kill-switch | `1` |
| `CURRENCY_DEFAULT_NAME` | нет | Название валюты по умолчанию | `«Пики»` |
| `GAMIFICATION_LEDGER_STRICT` | нет | Запретить отрицательный баланс | `1` |

## 3. Инфопотоки

```text
core event (StepCompleted, AssessmentPassed) ──► RewardEngine
                                                       │
                              ┌────────────────────────┴────────────────────┐
                              ▼                                             ▼
                    CurrencyTransaction (ledger)                     EmployeeReward
                              │                                             │
                              ▼                                             ▼
                       CurrencyBalance                                 achievements
```

## 4. Связь с ядром
- Читает: `users`, `positions`, `company_currency_settings`, `gamification_levels`, `gamification_reward_types`.
- Пишет: `currency_transactions`, `currency_balances`, `employee_rewards`, `peer_recognitions`, `achievements`.
- Ledger — append-only, изменения только через сервис.

## 5. Публичные эндпоинты
| Метод | Путь | Роли | Описание |
|---|---|---|---|
| GET | `/api/gamification/levels` | authenticated | Уровни |
| GET | `/api/gamification/shop` | authenticated | Каталог наград |
| POST| `/api/gamification/shop/{id}/redeem` | authenticated | Купить награду |
| GET | `/api/gamification/balance` | authenticated | Баланс пользователя |
| GET | `/api/achievements` | authenticated | Ачивки пользователя |
| POST| `/api/peer-recognition` | authenticated | Peer-recognition |

## 6. Запуск локально
Внутри core.

## 7. Тесты
`core/tests/Feature/GamificationLedgerTest.php`.
