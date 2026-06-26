## Причина падения деплоя

Два независимых дефекта в `.github/workflows/npm-publish.yml`, шаг **Setup on server**:

### 1. Сломанные кавычки в inline PHP (главная причина)

Сейчас на сервер по SSH отправляется одна большая строка в двойных кавычках:

```
"cd ... && php -r '
  require __DIR__."/vendor/autoload.php";
  ...
  $host = $_ENV["DB_HOST"] ?? "localhost";
  ...
' && php artisan migrate --force && ..."
```

Внутри этой внешней `"..."` стоят PHP-строки тоже в двойных кавычках (`"/vendor/autoload.php"`, `"DB_HOST"`, `"localhost"` и т.д.). Локальный bash на GitHub-раннере **закрывает** внешнюю `"` на первой же `"` внутри PHP — и одиночная кавычка `'` от `php -r '` остаётся незакрытой. Отсюда ошибки:
- `bash: -c: line 0: unexpected EOF while looking for matching `''`
- `bash: -c: line 15: syntax error: unexpected end of file`

Плюс локальный bash раскрывает `$_ENV`, `$host`, `$db` и т.п. в пустую строку ещё до отправки на сервер — PHP-код становится бессмысленным.

### 2. Шумная (но не фатальная) запись про SSH host key

```
client_global_hostkeys_prove_confirm: server gave bad signature for RSA key 0: incorrect signature
```

OpenSSH 9 на Ubuntu 24.04 пытается обновить host keys и ругается на ответ сервера nic.ru. На exit code это не влияет, но в логе мешает и пугает. Лечится `-o UpdateHostKeys=no`.

## Что меняем

### Файл `backend-laravel/scripts/db-preflight.php` (новый)

Выносим PHP-проверку БД в отдельный файл — никаких inline-кавычек:

```php
<?php
require __DIR__ . '/../vendor/autoload.php';
Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

$host     = $_ENV['DB_HOST']     ?? 'localhost';
$port     = $_ENV['DB_PORT']     ?? '3306';
$db       = $_ENV['DB_DATABASE'] ?? '';
$user     = $_ENV['DB_USERNAME'] ?? '';
$password = $_ENV['DB_PASSWORD'] ?? '';

echo "DB preflight: host={$host}, port={$port}, database={$db}, user={$user}\n";

if ($db === '' || $user === '') {
    fwrite(STDERR, "DB preflight failed: DB_DATABASE или DB_USERNAME пустые в backend/.env\n");
    exit(1);
}

try {
    new PDO(
        "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4",
        $user,
        $password,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    echo "DB preflight: OK\n";
} catch (Throwable $e) {
    fwrite(STDERR, "DB preflight failed: " . $e->getMessage() . "\n");
    fwrite(STDERR, "Проверь DB_HOST=gro7659365.mysql, DB_DATABASE, DB_USERNAME, DB_PASSWORD в backend/.env.\n");
    exit(1);
}
```

Файл попадает на сервер обычным `rsync` вместе с остальным бэкендом.

### Файл `.github/workflows/npm-publish.yml`

1. В шаге **Setup on server** заменить весь inline `php -r '...'` блок на одну строку:
   ```
   && php scripts/db-preflight.php \
   ```
2. Ко всем `ssh ...` и `rsync -e "ssh ..."` (4 места) добавить `-o UpdateHostKeys=no`, чтобы убрать предупреждение `client_global_hostkeys_prove_confirm`.

Изменений в логике мерджа `.env`, в приоритете серверных значений и в наборе секретов — **никаких**.

## Что произойдёт после мержа

- Деплой не падает на кавычках; preflight БД проходит как обычный PHP-скрипт.
- Если креды БД на сервере неверные — preflight даст осмысленную ошибку с реальным сообщением от MySQL.
- Лог чище: больше нет `client_global_hostkeys_prove_confirm`.
