## План: перевыпуск SSH-ключа для авто-деплоя

Цель — сгенерировать новую пару SSH-ключей без пароля, положить публичную часть на сервер, приватную — в GitHub Secrets, и заново запустить workflow `Deploy Frontend`.

### Шаг 1. Сгенерировать новую пару ключей на сервере

На сервере `ssh.gro7659365.nichost.ru` под пользователем `gro7659365`:

```bash
ssh-keygen -t ed25519 -N "" -C "github-actions-deploy" -f ~/.ssh/gh_deploy
```

Флаг `-N ""` = без passphrase (это была причина падения `webfactory/ssh-agent`).

### Шаг 2. Разрешить вход по этому ключу

```bash
cat ~/.ssh/gh_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

### Шаг 3. Проверить, что ключ работает

С любой машины (или тем же сервером на самого себя):

```bash
ssh -i ~/.ssh/gh_deploy gro7659365@ssh.gro7659365.nichost.ru "echo OK"
```

Должно вывести `OK` без запроса пароля.

### Шаг 4. Забрать приватный ключ

```bash
cat ~/.ssh/gh_deploy
```

Скопировать весь блок целиком, включая строки:

```
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

### Шаг 5. Положить в GitHub Secrets

GitHub → репозиторий `zaslavv-web/carboost` → **Settings → Secrets and variables → Actions → New repository secret**

Три секрета (если каких-то нет — создать; если есть — Update):

- `DEPLOY_SSH_KEY` — приватный ключ из шага 4 (целиком, с BEGIN/END строками, без лишних пробелов)
- `DEPLOY_HOST` — `ssh.gro7659365.nichost.ru`
- `DEPLOY_USER` — `gro7659365`

### Шаг 6. Перезапустить workflow

GitHub → **Actions → Deploy Frontend → Run workflow → Run workflow (main)**

### Шаг 7. Если снова упадёт

Прислать лог шага, где ошибка — разберём по конкретному сообщению (host key, permission denied, path и т.д.).

### Заметка про Node 20 warning

Это deprecation warning, не ошибка — деплой из-за него не падает. Обновление actions до Node 24 сделаем отдельным коммитом позже.

---

Подтвердите — начинаем с шага 1 на сервере?  
  
Run DELETE_FLAG=""  


ℹ️  --delete выключен (безопасный режим первого прогона)  


Unable to negotiate with 31.177.95.54 port 22: no matching host key type found. Their offer: ssh-rsa  


rsync: connection unexpectedly closed (0 bytes received so far) [sender]  


rsync error: unexplained error (code 255) at io.c(232) [sender=3.2.7]  


**Error:** Process completed with exit code 255.

&nbsp;