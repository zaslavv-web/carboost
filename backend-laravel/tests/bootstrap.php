<?php

// Prevent a host/CI database URL from overriding the isolated in-memory
// database declared in phpunit.xml before Laravel is bootstrapped.
putenv('DB_URL=');
$_ENV['DB_URL'] = '';
$_SERVER['DB_URL'] = '';

require dirname(__DIR__) . '/vendor/autoload.php';