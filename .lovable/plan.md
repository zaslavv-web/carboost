## Что не так сейчас

**1) Чаты — поиск ничего не находит**
В `ChatController::contacts` (`backend-laravel/app/Http/Controllers/Api/ChatController.php`, ~ строка 287) поиск идёт ТОЛЬКО по `profiles.full_name` через `ILIKE %запрос%`. Если у сотрудника фамилия не записана в `full_name` (например, в `full_name` имя транслитом или пусто, а пользователь ищет по фамилии/почте) — список пустой. Поиска по email вообще нет.

**2) HRD не видит почту и не может открыть профиль сотрудника**

- В `AppSidebar.tsx` у роли `hrd` нет пункта «Пользователи» (`/users`) — только `/employees` (HRDDashboard).
- В `HRDDashboard.tsx` (вкладка «Сотрудники», ~ строка 752–800) список сотрудников показывает только `full_name`, email не запрашивается и нигде не выводится. ФИО не является ссылкой — нет перехода на `/users/:userId` (страница `UserProfileFull`, которая email уже умеет показывать).
- Сам бэкенд (`/profiles` и `/profiles/{id}`) email уже отдаёт (`ProfileController::index` / `withRoles`), и HRD имеет `viewAny` / `view` через `ProfilePolicy` — нужны только UI-правки.

## Что сделаю

### Backend — расширить поиск контактов

Файл: `backend-laravel/app/Http/Controllers/Api/ChatController.php`, метод `contacts()`.

При непустом `$q` заменить

```
$query->where('full_name', 'ilike', '%'.$q.'%');
```

на группу OR:

```
$like = '%'.$q.'%';
$query->where(function ($w) use ($like) {
    $w->where('full_name', 'ilike', $like)
      ->orWhereIn('user_id', function ($sub) use ($like) {
          $sub->select('id')->from('users')->where('email', 'ilike', $like);
      });
});
```

Это даст поиск и по ФИО, и по полной/частичной почте, в той же логике, что уже используется в `ProfileController::index`. Мульти-tenant ограничение (`company_id` для не-суперадмина) сохраняется.

### Frontend — HRD видит почту сотрудника и открывает его профиль

Файл: `src/pages/HRDDashboard.tsx`.

1. В `useEmployeesWithRoles` дотягивать email тем же способом, что в `UsersManagement.tsx`:
  - добавить третий запрос `laravel.get('/profiles?per_page=500')`, собрать `Map<user_id, email>` и подмешать поле `email` в каждого сотрудника (тип `EmployeeWithRole` расширить полем `email?: string | null`).
2. В таблице вкладки «Сотрудники» (≈ строки 752–800):
  - обернуть ФИО в `<Link to={`/users/${emp.user_id}`}>` (роуты уже есть в `App.tsx:97`, страница `UserProfileFull` корректно работает для HRD).
  - под ФИО показать `emp.email` как `mailto:` ссылку мелким шрифтом (как в `UsersManagement.tsx:390–392`).
3. То же самое в карточке «Запросы на смену должности» (≈ строки 595–610) — кликабельное ФИО + email.

### Sidebar для HRD

Файл: `src/components/AppSidebar.tsx`, ветка `role === "hrd"` (~ строка 111).
Добавить пункт «Пользователи» (`/users`, иконка `UserCog`, ключ `t("nav.users")`) рядом с `employeesGroup`, чтобы HRD мог открыть полный список с поиском по почте/ФИО (страница `UsersManagement` уже отдаёт email и роли, политика `viewAny` это разрешает).

## Что НЕ трогаю

- Структуру БД и миграции — изменений в схеме не требуется.
- Логику policies и middleware — текущих прав HRD достаточно.
- Поиск по контактам у суперадмина — он уже видит всю платформу; правка просто добавит ему ещё и поиск по email.

## Проверка после правок

1. Под HRD/Company Admin в чате ввести фамилию или часть email коллеги — пользователь находится.
2. Под HRD на странице `/employees` во вкладке «Сотрудники» — видна почта рядом с ФИО, клик по ФИО открывает `/users/:userId`.
3. Под HRD в сайдбаре появляется пункт «Пользователи», `/users` открывается, в таблице видны email сотрудников компании.  
  
также надо понять и исправить ошибки, которые видно через f12:  
Failed to load resource: the server responded with a status of 401 ()
  api/chats/contacts?q=hfcc:1  Failed to load resource: the server responded with a status of 500 ()
  api/chats/contacts?q=%D1%80%D0%B0:1  Failed to load resource: the server responded with a status of 500 ()
  api/chats/contacts?q=%D1%80%D0%B0%D1%81:1  Failed to load resource: the server responded with a status of 500 ()
  api/chats/contacts?q=r:1  Failed to load resource: the server responded with a status of 500 ()
  api/chats/contacts?q=ra:1  Failed to load resource: the server responded with a status of 500 ()
  api/chats/contacts?q=ras:1  Failed to load resource: the server responded with a status of 500 ()
  api/chats/contacts?q=cjn:1  Failed to load resource: the server responded with a status of 500 ()
  api/chats/contacts?q=%D0%A0%D0%B0%D1%81%D1%81:1  Failed to load resource: the server responded with a status of 500 ()
  api/chats/contacts?q=%D0%A0%D0%B0%D1%81%D1%81%D1%83:1  Failed to load resource: the server responded with a status of 500 ()
  api/chats/contacts?q=%D0%A0%D0%B0%D1%81%D1%81%D1%83%D0%B4%D0%B6:1  Failed to load resource: the server responded with a status of 500 ()
  api/chats/contacts?q=%D0%A0%D0%B0%D1%81%D1%81%D1%83%D0%B4%D0%BA%D0%BE%D0%B2%D0%B0:1  Failed to load resource: the server responded with a status of 500 ()