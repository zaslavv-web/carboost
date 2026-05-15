# Reverb (WebSocket-сервер) — отдельный контейнер на том же образе, что php-fpm,
# но запускает `php artisan reverb:start` вместо php-fpm.
FROM php:8.3-cli-alpine

RUN apk add --no-cache bash postgresql-dev oniguruma-dev libzip-dev icu-dev \
    && docker-php-ext-install pdo_pgsql pgsql intl zip bcmath pcntl sockets \
    && pecl install redis && docker-php-ext-enable redis \
    && rm -rf /var/cache/apk/*

WORKDIR /var/www/html
USER www-data
EXPOSE 8080
CMD ["php", "artisan", "reverb:start", "--host=0.0.0.0", "--port=8080"]
