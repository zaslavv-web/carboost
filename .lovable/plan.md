## Диагноз (точный)

`storage/logs/laravel.log`:

```
Unknown named parameter $textString at app/Mail/EmployeeInvited.php:98
```

В строке 98:

```php
return new Content(htmlString: $html, textString: $text);
```

Установленный `Illuminate\Mail\Mailables\Content` в этом проекте не имеет свойств `htmlString`/`textString` (это Laravel 10.x до определённого патча / 9.x). Из-за исключения:

- `sendInvitationMail()` ловит `Throwable` → возвращает `false`, `mailed` = 0;
- запись в `employee_invitations` при этом **уже создана/обновлена** (что и видно в БД: `pending`, `updated_at 20:15:17`);
- бэк отдаёт `created:1, mailed:0, errors:[{email:"…", error:"Письмо не отправлено: Unknown named parameter $textString"}]`;
- фронт при `actionable=1, mailed=0` должен показать **warning** «часть писем не ушла», но пользователь видит «Приглашения не созданы».

Проверил ветку в `Invitations.tsx:83-86` — она уже корректна. Значит фронт-часть в порядке; путаницу создавал именно провал письма. Но пользователь всё равно воспринимает это как «ничего не работает», поэтому текст сообщения улучшим.

## Что чиню

### 1. `backend-laravel/app/Mail/EmployeeInvited.php` — уходим от `Content` совсем

Использую классический `build()` с `->html($html)->subject(...)`. Метод `Mailable::html(string)` доступен во всех современных Laravel (9+) и не требует view-файла. Отдельный plain-text опустим — Symfony Mailer сам сформирует текстовую часть из HTML; это гораздо надёжнее, чем зависеть от версии `Content`.

```php
public function build()
{
    // ...тот же расчёт $safeUrl и $html...
    return $this->subject($this->companyName
        ? "Приглашение в «Пик Роста» — {$this->companyName}"
        : 'Приглашение в «Пик Роста»'
    )->html($html);
}
```

Удаляю метод `content()`, `envelope()` при необходимости оставляю пустым или удаляю (Laravel допускает `build()` как альтернативу).

### 2. `src/pages/Invitations.tsx` — точнее текст тоста

- Заменю «Приглашения не созданы» на «Не удалось создать приглашения» и всегда буду показывать `firstError` (сейчас показывается только при `actionable=0`).
- В warning-ветке добавлю подсказку «строка в базе создана, письмо не ушло — попробуйте кнопку „Отправить повторно“».

### 3. `RpcController::sendInvitationMail` — расширяю лог

Добавлю в `Log::error('Invitation mail failed', …)` поле `class`, `file`, `line` — чтобы будущие сбои конверта диагностировались с одного взгляда без stack-trace.

## Проверка

Синтаксис PHP-файла проверю через `php -l` (в sandbox nix-shell). Ожидаемый результат после `git pull` + `php artisan optimize:clear` на проде:

- клик «Пригласить» → тост «Создано: 1, отправлено писем: 1»;
- в `employee_invitations` статус `pending`, письмо приходит на `muxtar2005@gmail.com`;
- в логе нет `Unknown named parameter`.

## Оставшиеся хвосты (не в этом фиксе, только фиксирую)

- `profiles.email` отсутствует — где-то в коде на это будет тянуть. Уже видно в `PeopleAnalyticsController`/некоторых RPC. Отдельной задачей: добавить колонку `email` в `profiles` (миграция) **или** переключить эти места на JOIN `users.email`.   
сразу найди и исправь
- Тексты приглашения выводят кириллицу; при `->html()` charset берётся из конфига `mail.markdown`/`mailer` — на проде проверим Content-Type в присланном письме, при необходимости добавлю `headers()` с `text/html; charset=utf-8`.

Приступаю к правкам сразу после подтверждения.  
  
Перепроверь:  
1) текст ошибки должен содержать явное указание пользователю что нужно поправить чтобы случился успешный успех  
2) на кнопках установлены рабобтающие процессы - если барахлит отправка писем нужно определить причину и ее починить  
3) если проблема в самом адресе - выдать сообщение пользователю что он пытается добиться не добиваемого

&nbsp;