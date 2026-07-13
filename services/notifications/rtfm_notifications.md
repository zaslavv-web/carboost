# rtfm_notifications — Уведомления, e-mail, webhooks, iCal

> Статус: **каркас (stage 1)**.

## 1. Назначение
Транспорт исходящей коммуникации: e-mail (Unisender Go API + Yandex SMTP как fallback), webhooks для интеграций с внешними системами, iCal-экспорт отпусков/событий, in-app notifications.

## 2. Переменные окружения

| KEY | Обязат. | Описание | Пример |
|---|---|---|---|
| `MAIL_MAILER` | да | `unisender_go` / `smtp` / `log` | `unisender_go` |
| `MAIL_FROM_ADDRESS` | да | Отправитель | `noreply@mail.growth-peak.pro` |
| `MAIL_FROM_NAME` | да | Имя отправителя | `Growth Peak` |
| `UNISENDER_GO_API_KEY` | если mailer=unisender_go | Ключ Unisender Go | `...` |
| `UNISENDER_GO_ENDPOINT` | нет | Endpoint | `https://go2.unisender.ru/ru/transactional/api/v1/email/send.json` |
| `MAIL_HOST/PORT/USERNAME/PASSWORD/ENCRYPTION` | если mailer=smtp | Fallback SMTP | Yandex 465/ssl |
| `SALES_NOTIFICATION_EMAIL` | да | BCC для лидов | `sales@...` |
| `WEBHOOK_SIGNING_SECRET` | да | HMAC для исходящих | `...` |
| `MAIL_HEARTBEAT_ENABLED` | нет | Ежедневный self-check | `1` |

## 3. Инфопотоки

```text
core event ──► NotificationDispatcher ──► queue(mail|webhook)
                                            │
                            ┌───────────────┼────────────────┐
                            ▼               ▼                ▼
                     UnisenderGoTransport  SMTP        WebhookDispatcher
                            │               │                │
                            ▼               ▼                ▼
                       Unisender API   Yandex SMTP     внешний URL (HMAC)
```

## 4. Связь с ядром
- Слушает события: `UserRegistered`, `PasswordResetRequested`, `LeaveApproved`, `DemoRequestSubmitted`, `PricingInquirySubmitted`, `AssessmentCompleted`.
- Пишет: `notifications`, `webhook_deliveries`, `email_log`.
- Читает: `webhooks`, `user_notification_preferences`.

## 5. Публичные эндпоинты
| Метод | Путь | Роли | Описание |
|---|---|---|---|
| GET  | `/api/notifications` | authenticated | In-app лента |
| POST | `/api/notifications/read` | authenticated | Отметить прочитанным |
| GET  | `/api/webhooks` | Admin | Список |
| POST | `/api/webhooks` | Admin | Создать |
| DELETE | `/api/webhooks/{id}` | Admin | Удалить |
| GET  | `/api/ical/leaves/{token}` | public (по токену) | iCal-фид отпусков |

## 6. Запуск локально
`php artisan queue:work --queue=mail,webhook`

## 7. Тесты
`core/tests/Feature/NotificationDispatcherTest.php`, `WebhookDispatcherTest.php`.
