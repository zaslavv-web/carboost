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
