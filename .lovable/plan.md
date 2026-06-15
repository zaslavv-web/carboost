## Изменение

В `src/pages/CareerTrack.tsx` (строка 119) заменить чтение из таблицы `gamification_reward_types` на безопасное представление `gamification_rewards_public`, которое не содержит чувствительных полей (`gift_content`, `monetary_amount`).

### Что делаем

- Заменить `laravelDb.from("gamification_reward_types").select("*")` на `laravelDb.from("gamification_rewards_public").select("*")`.
- Остальная логика (`rewardTypeMap`, расчёт `totalPoints` по `points`) остаётся без изменений — поле `points` присутствует и в публичном view.

### Чего НЕ трогаем

- Авторские/админские экраны (`GamificationManagement` и т.п.), где требуется полный доступ к чувствительным полям — продолжают читать базовую таблицу под admin-RLS.
- Типы в `src/integrations/supabase/types.ts` (уже обновлены миграцией).

После правки сотрудник перестанет получать `gift_content`/`monetary_amount` через CareerTrack, что закрывает соответствующую находку сканера.  
Появилась еще одна проблема: при входе в учетную запись HRD из-под админа боковое меню перестает работать как надо - например, курс создать невозможно

&nbsp;