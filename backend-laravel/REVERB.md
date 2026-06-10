# Reverb (WebSockets) — план включения

Фронт уже умеет общаться с Reverb через `src/integrations/laravel/realtime.ts`
(API совместим с `legacy.channel().on('postgres_changes', ...)`).

На бэке Reverb пока не активирован. Шаги, когда понадобится realtime:

## 1. Установка
```bash
composer require laravel/reverb
php artisan reverb:install
```

## 2. .env
```
BROADCAST_CONNECTION=reverb
REVERB_APP_ID=growthpeak
REVERB_APP_KEY=<random-32>
REVERB_APP_SECRET=<random-64>
REVERB_HOST=0.0.0.0
REVERB_PORT=8080
REVERB_SCHEME=http
```

Соответствующие переменные на фронте:
```
VITE_REVERB_KEY=<тот же REVERB_APP_KEY>
VITE_REVERB_HOST=ws.growth-peak.pro
VITE_REVERB_PORT=443
VITE_REVERB_SCHEME=https
```

## 3. Supervisor
```ini
[program:laravel-reverb]
command=php /var/www/api/artisan reverb:start --host=0.0.0.0 --port=8080
autostart=true
autorestart=true
user=www-data
stdout_logfile=/var/log/reverb.log
stderr_logfile=/var/log/reverb.err.log
```

## 4. nginx-проксирование
```
upstream reverb { server 127.0.0.1:8080; }
server {
  listen 443 ssl http2;
  server_name ws.growth-peak.pro;
  location / {
    proxy_pass http://reverb;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
  }
}
```

## 5. Серверное событие
```php
// app/Events/PostgresChange.php
class PostgresChange implements ShouldBroadcastNow {
  public function __construct(public array $payload) {}
  public function broadcastOn(): array {
    return [new PrivateChannel('company.' . $this->payload['company_id'])];
  }
}
// триггерится из Eloquent observer'а после save/delete.
```

После этого `laravelRealtime.channel('company.xxx').on('postgres_changes', {event:'*', table:'notifications'}, cb).subscribe()` заработает без изменений во фронте.
