# План: найти, где живёт backend, и выполнить диагностику

Сейчас непонятно как развёрнут backend на сервере и где он лежит. Сначала разведка, потом точечные команды диагностики почты.

## Шаг 1. Разведка — выясняем тип установки

Подключись по SSH (ты уже там как `gro7659365`) и выполни **построчно**, каждую команду отдельно. Пришли мне вывод **всех** команд целиком.

```bash
# Кто я и где
whoami
pwd
hostname

[gro7659365@gro7659365 backend]$ whoami
gro7659365
[gro7659365@gro7659365 backend]$ pwd
/home/gro7659365/growth-peak.pro/docs/backend
[gro7659365@gro7659365 backend]$ hostname
gro7659365.nichost.ru


# Есть ли docker под другим именем или через sudo
which docker
which docker-compose
which podman
sudo -n docker ps 2>&1 | head -5
ls /var/run/docker.sock 2>&1

[gro7659365@gro7659365 backend]$ which docker
/usr/bin/which: no docker in (/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/sbin:/home/gro7659365/.composer/vendor/bin)
[gro7659365@gro7659365 backend]$ which docker-compose
/usr/bin/which: no docker-compose in (/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/sbin:/home/gro7659365/.composer/vendor/bin)
[gro7659365@gro7659365 backend]$ which podman
/usr/bin/which: no podman in (/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/sbin:/home/gro7659365/.composer/vendor/bin)
[gro7659365@gro7659365 backend]$ sudo -n docker ps 2>&1 | head -5
-bash: sudo: command not found
[gro7659365@gro7659365 backend]$ ls /var/run/docker.sock 2>&1
ls: cannot access '/var/run/docker.sock': No such file or directory


# Найти все Laravel-проекты на диске (ищем artisan)
sudo find / -maxdepth 6 -name artisan -not -path "*/vendor/*" 2>/dev/null
# Если sudo нельзя — без него:
find / -maxdepth 6 -name artisan -not -path "*/vendor/*" 2>/dev/null
/home/gro7659365/growth-peak.pro/docs/backend/artisan


# Найти docker-compose файлы
sudo find / -maxdepth 5 -name "docker-compose*.y*ml" 2>/dev/null
ничего не произошло
по ощущениям, sudo не отрабатывает

# Что слушает порты 80/443/8000/9000 — это backend
sudo ss -tlnp 2>/dev/null | grep -E ":(80|443|8000|8080|9000)\b"
ничего не произошло
по ощущениям, sudo не отрабатывает

# Какие nginx-сайты настроены (там обычно root указывает на проект)
ls /etc/nginx/sites-enabled/ 2>/dev/null
sudo cat /etc/nginx/sites-enabled/* 2>/dev/null | grep -E "root|server_name|fastcgi_pass"
ничего не произошло

# Активные сервисы php-fpm / supervisor / laravel
systemctl list-units --type=service --state=running 2>/dev/null | grep -iE "php|nginx|laravel|docker|supervisor"
[gro7659365@gro7659365 ~]$ systemctl list-units --type=service --state=running 2>/dev/null | grep -iE "php|nginx|laravel|docker|supervisor"
httpd@php82.service                                  loaded active running The Apache HTTP Server with php82
nginx.service                                        loaded active running The nginx HTTP and reverse proxy server

```

&nbsp;

## Шаг 2. По результатам — даю конкретные команды диагностики

После твоего ответа я составлю один из трёх вариантов точных команд:

- **Если docker есть, но не виден тебе** → команды с `sudo docker compose ...` либо инструкцию переключиться на другого пользователя.
- **Если установка bare-metal (nginx + php-fpm)** → команды вида:
  ```
  cd /<путь>/backend-laravel/app-src
  php artisan config:clear
  tail -n 200 storage/logs/laravel.log | grep -i "Sales notification"
  php artisan tinker --execute="..."
  ```
- **Если backend на отдельном сервере** → инструкцию, как туда попасть (часто это другой VPS / контейнер у хостера).

## Шаг 3. Параллельно — что можно сделать прямо в UI без SSH

Чтобы не терять время на разведку, открой в браузере под суперадмином:

**Кабинет → Настройки → Email Settings** (Superadmin → Email Settings)

Там уже есть страница со всеми SMTP-настройками и кнопкой **«Тест SMTP»**. Сделай так:

1. Проверь, есть ли активная запись.
2. Если есть — нажми «Тест SMTP» и пришли мне точный текст ошибки.
3. Если записи нет или ошибка про пароль — введи: provider `yandex`, host `smtp.yandex.ru`, port `465`, encryption `ssl`, username `growthpeak@yandex.ru`, password `wrtwpknhswvvsxhk`, from `growthpeak@yandex.ru`, сохрани, нажми «Тест SMTP».

Скорее всего, причина именно в этой странице: в БД лежит активная запись `email_settings` с другим/протухшим паролем, и она **перебивает** твой `.env` при отправке заявок (`notifySales` сначала пробует БД, на runtime env откатывается только при auth-ошибке определённого вида).

---

Дай вывод команд из Шага 1 **и/или** результат «Тест SMTP» из Шага 3 — после этого я смогу точечно починить.