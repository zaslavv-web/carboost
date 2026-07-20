## Диагноз

Сервер `ssh.gro7659365.nichost.ru` предлагает только host-key типа `ssh-rsa` (SHA-1). GitHub-runner использует свежий OpenSSH 9.x, где `ssh-rsa` отключён по умолчанию. Прошлая правка добавила `-o HostKeyAlgorithms=+ssh-rsa` в `-e` для rsync, но ошибка осталась — значит одного флага недостаточно. В свежем OpenSSH также требуется явно разрешить SHA-1-подпись для host-key через `-o CASignatureAlgorithms=+ssh-rsa` и/или снизить `RequiredRSASize`, а также важно, чтобы `ssh-keyscan` реально записал ssh-rsa host-ключ в `known_hosts` (иначе первое подключение падает до применения алгоритмов).

Плюс отдельно — warning "Node 20 is being deprecated" в `webfactory/ssh-agent@v0.9.0` — обновим до `v0.10.1` (Node 24).

## Что меняем в `.github/workflows/deploy-frontend.yml`

### 1. Шаг «Trust host key»

Явно принудительно записать ssh-rsa host-key и повысить приоритет legacy алгоритмов на уровне `~/.ssh/config` — чтобы это применялось и к `ssh-agent`, и к `rsync -e ssh`.

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keyscan -t ssh-rsa -H "$DEPLOY_HOST" >> ~/.ssh/known_hosts 2>/dev/null
ssh-keyscan -t rsa,ecdsa,ed25519 -H "$DEPLOY_HOST" >> ~/.ssh/known_hosts 2>/dev/null || true
cat > ~/.ssh/config <<EOF
Host $DEPLOY_HOST
  HostName $DEPLOY_HOST
  User $DEPLOY_USER
  HostKeyAlgorithms +ssh-rsa
  PubkeyAcceptedAlgorithms +ssh-rsa
  PubkeyAcceptedKeyTypes +ssh-rsa
  CASignatureAlgorithms +ssh-rsa
  RequiredRSASize 1024
EOF
chmod 600 ~/.ssh/config
```

### 2. Шаг «Deploy (rsync…)»

Расширить `-e` теми же опциями, чтобы не зависеть только от `~/.ssh/config`:

```bash
-e "ssh -o HostKeyAlgorithms=+ssh-rsa \
        -o PubkeyAcceptedAlgorithms=+ssh-rsa \
        -o PubkeyAcceptedKeyTypes=+ssh-rsa \
        -o CASignatureAlgorithms=+ssh-rsa \
        -o RequiredRSASize=1024 \
        -o StrictHostKeyChecking=accept-new"
```

&nbsp;

[gro7659365@gro7659365 ~]$ mkdir -p ~/.ssh && chmod 700 ~/.ssh

[gro7659365@gro7659365 ~]$ ssh-keyscan -t ssh-rsa -H "$DEPLOY_HOST" >> ~/.ssh/known_hosts 2>/dev/null

[gro7659365@gro7659365 ~]$ ssh-keyscan -t rsa,ecdsa,ed25519 -H "$DEPLOY_HOST" >> ~/.ssh/known_hosts 2>/dev/null || true

[gro7659365@gro7659365 ~]$ cat > ~/.ssh/config <<EOF

> Host $DEPLOY_HOST

>   HostName $DEPLOY_HOST

>   User $DEPLOY_USER

>   HostKeyAlgorithms +ssh-rsa

>   PubkeyAcceptedAlgorithms +ssh-rsa

>   PubkeyAcceptedKeyTypes +ssh-rsa

>   CASignatureAlgorithms +ssh-rsa

>   RequiredRSASize 1024

> EOF

[gro7659365@gro7659365 ~]$ chmod 600 ~/.ssh/config

[gro7659365@gro7659365 ~]$ -e "ssh -o HostKeyAlgorithms=+ssh-rsa \

>         -o PubkeyAcceptedAlgorithms=+ssh-rsa \

>         -o PubkeyAcceptedKeyTypes=+ssh-rsa \

>         -o CASignatureAlgorithms=+ssh-rsa \

>         -o RequiredRSASize=1024 \

>         -o StrictHostKeyChecking=accept-new"

-bash: -e: command not found

&nbsp;

### 3. Bump ssh-agent action

`webfactory/ssh-agent@v0.9.0` → `webfactory/ssh-agent@v0.10.1` (убирает warning про Node 20).

## После merge

Пуш в `main` авто-триггерит workflow. Если снова упадёт — пришлите шаг «Deploy» целиком, будем сужать (`ssh -vvv`).

## Что НЕ трогаем

Секреты, ключ, WEB_ROOT, логику `--delete`, exclude-паттерны — всё как договорились.