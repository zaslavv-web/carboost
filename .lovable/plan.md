## Устранение оставшихся уязвимостей по результатам скана

Свежий скан вернул 75 находок. Из них 2 «настоящие» (error/warn от LLM-сканера supabase_lov), 2 ошибки по SECURITY DEFINER view, и ~71 шумный лайнт о том, что SECURITY DEFINER функции вызываемы anon/authenticated. Все они устраняются одной миграцией + точечной правкой клиентского кода.

### 1. Тест-атаки можно фальсифицировать (PRIVILEGE_ESCALATION_SCORE_MANIPULATION, error)
- В таблице `test_attempts` есть политика `Users can create own attempts` — любой залогиненный сотрудник может вставить `score = 100`.
- **Миграция:** удалить INSERT-политику. Прямая запись для `authenticated` запрещена; писать может только `service_role` и SECURITY DEFINER RPC `submit_test_attempt()`, который уже считает балл на сервере.
- **Клиент:** заменить два прямых insert на RPC:
  - `src/components/StepSubmissionDialog.tsx` (`submitTest`) → `laravelRpc('submit_test_attempt', { _test_id, _source: 'career_step', _answers })`; брать `attempt_id` и `score` из ответа RPC.
  - `src/components/ClosedQuestionTestRunner.tsx` (HRD-тесты, `test.source==='hrd'` и есть `test.testId`) → тоже через `submit_test_attempt`. Локальный подсчёт `breakdown` остаётся только для UI; в БД пишет RPC.
  - Для AI-сценариев (`test.source==='ai'`, без `test_id`) убрать запись в `test_attempts` совсем и оставить только запись в `assessments` (этот трек скоринга и так не верифицируется тестом).

### 2. HRD напрямую правит `user_roles` (HARD_RULE_VIOLATION_ROLE_MUTATION, warn)
- Политики `HRD can insert non-privileged roles in own company` и `HRD can delete non-privileged roles in own company` обходят `verify_user`/`reject_user`/`delete_user`.
- **Миграция:** удалить обе политики. Доступ HRD к назначению ролей остаётся через существующие RPC (`verify_user`, `reject_user`, `delete_user`).
- **Клиент:** проверить, что HRD-страницы используют только RPC; при необходимости заменить прямые `from('user_roles').insert/delete` на RPC.

### 3. Два SECURITY DEFINER view (SUPA_security_definer_view, error ×2)
Views `closed_question_tests_safe` и `gamification_rewards_public` сейчас созданы с `security_invoker = off`, чтобы обходить RLS и при этом скрывать чувствительные колонки. Postgres-лайнтер этот паттерн помечает критическим.
- **Миграция (переход на column-level security):**
  - DROP оба view.
  - `closed_question_tests`: `REVOKE SELECT (questions) FROM authenticated, anon;` и вернуть политику `Company users can view active company tests` (SELECT для сотрудников своей компании, `is_active = true`). Сотрудник сможет читать метаданные, но не колонку `questions` — оригинальная угроза (правильные ответы) остаётся закрытой. Скоринг и доставка sanitized-вопросов уже идут через RPC.
  - `gamification_reward_types`: `REVOKE SELECT (gift_content, monetary_amount, monetary_currency) FROM authenticated, anon;` и вернуть политику `Company users can view company reward types`.
- **Клиент:** заменить три обращения к view на базовую таблицу:
  - `src/pages/CareerTrack.tsx` — `from('gamification_rewards_public')` → `from('gamification_reward_types').select(<безопасные колонки>).eq('is_active', true)`.
  - `src/pages/__tests__/CareerTrack.rewards.test.tsx` — обновить ожидания (имя таблицы).
  - Регенерированные `src/integrations/supabase/types.ts` обновятся автоматически после миграции.

### 4. Шум SECURITY DEFINER функций (~71 находка, warn)
Большинство — триггерные функции (`on_*`, `protect_*`, `update_updated_at_column`, `payout_*`, `hash_invitation_token`, `validate_*`, `notify_*`, `sync_*`) и хелперы (`build_employee_artifacts`, `find_company_by_name`, `register_company`, `submit_demo_request`, `grant_rewards_for_event`, `handle_new_user`). Триггерные не должны быть вызываемы напрямую вообще.
- **Миграция:** одним блоком `REVOKE EXECUTE ... FROM anon, authenticated, PUBLIC` на все триггерные/internal функции; `GRANT EXECUTE ... TO service_role` где нужно. Оставить EXECUTE для anon/authenticated только на:
  - `has_role`, `get_user_company_id` — нужны RLS;
  - `submit_demo_request`, `register_company` — публичные формы лендинга (anon);
  - публичные RPC, вызываемые из клиента: `submit_test_attempt`, `get_safe_test_questions`, `submit_employee_questionnaire`, `bulk_invite_employees`, `assign_role`, `verify_user`, `reject_user`, `delete_user`, `fulfill_shop_order`, `create_shop_order`, `review_career_step`, `award_currency` (только для авторизованных).

### 5. Финальная верификация
- Перезапустить `security--run_security_scan` и `supabase--linter`.
- Цель: 0 error, 0 warn (или только остаточные warn по `has_role`/`get_user_company_id`, которые помечаются как принятый риск через `manage_security_finding` + `security--update_memory`).

### Что НЕ трогаем
- Триггеры на `auth.users` (`handle_new_user`) — Supabase-managed.
- Скрытие столбца `token` в `employee_invitations` (уже закрыто).
- AI-скоринг сценариев (вне scope этой задачи; помечен как приёмлемый риск).

### Технические детали
- Все правки БД — одной миграцией через `supabase--migration`.
- Клиентский TypeScript `types.ts` автогенерируется — руками не править.
- После миграции прогнать `vitest run` для затронутых тестов.
