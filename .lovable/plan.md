## Причина алерта

Бэкенд `bulkInviteEmployees` (RpcController.php:164-178) возвращает «Не указана компания», когда `$actor->companyId()` = null. Метод `User::companyId()` читает `profiles.company_id` по `profiles.user_id = auth.user_id`. То есть у Дарьи в её строке `profiles` либо `company_id IS NULL`, либо строки `profiles` вообще нет.

Скорее всего это дефект сидера `**org:seed-150**`: там вызывается `AuthUserService::createWithPassword(..., companyId: $this->companyId, ...)`, а он записывает `profiles.company_id` только если проходит проверка `canWriteColumnValue('profiles','company_id',$companyId)`. На prod-MySQL с char/uuid-колонкой эта проверка может отбраковать значение, тогда профиль создаётся без компании. Дальше сидер делает `UPDATE profiles ... WHERE user_id = $uid` (строка 399), но `company_id` в этом апдейте не идёт через тот же гвард — и по факту в проде у всех 149 сотрудников AIGuild `profiles.company_id` пустой. Из-под учётки владельца всё работает, потому что её `profiles.company_id` был проставлен при регистрации компании.

Диагностика первая — план не завязывается на непроверенный факт.  


нет, у боевой компании та же проблема

