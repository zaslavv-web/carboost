FROM php:8.3-fpm-alpine

# Системные зависимости
RUN apk add --no-cache \
        bash git curl unzip icu-dev libzip-dev libpng-dev libjpeg-turbo-dev \
        freetype-dev postgresql-dev oniguruma-dev autoconf g++ make linux-headers \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
        pdo_pgsql pgsql intl zip gd bcmath opcache pcntl \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apk del autoconf g++ make linux-headers \
    && rm -rf /var/cache/apk/*

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# OPcache (production-настройки)
RUN { \
        echo 'opcache.enable=1'; \
        echo 'opcache.memory_consumption=256'; \
        echo 'opcache.max_accelerated_files=20000'; \
        echo 'opcache.validate_timestamps=0'; \
        echo 'opcache.preload_user=www-data'; \
    } > /usr/local/etc/php/conf.d/opcache.ini \
    && { \
        echo 'memory_limit=512M'; \
        echo 'upload_max_filesize=50M'; \
        echo 'post_max_size=50M'; \
        echo 'max_execution_time=120'; \
    } > /usr/local/etc/php/conf.d/app.ini

WORKDIR /var/www/html

# Запускаем как www-data
USER www-data

EXPOSE 9000
CMD ["php-fpm"]
