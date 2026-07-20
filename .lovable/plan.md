## Что реально происходит

Вы сейчас в `/home/gro7659365/growth-peak.pro/docs`, но по ошибкам видно:

- это **не git-репозиторий**: `fatal: not a git repository`;
- там **нет frontend-проекта**: отсутствует `package.json`;
- `npm ci` здесь не подходит: по официальной документации npm он работает только при наличии `package-lock.json` / `npm-shrinkwrap.json`, а в текущем каталоге их нет.

**Do I know what the issue is?** Да: команды запускаются не из каталога, где лежит исходный frontend-проект. Нужно сначала найти реальный каталог с `.git` и `package.json`, а уже потом ставить зависимости и собирать.

## Что сделать на сервере

### 1. Найти, где лежит frontend-проект

Выполните:

```bash
cd /home/gro7659365

find . -maxdepth 5 -name package.json -o -name .git 2>/dev/null
```

Нужен каталог, в котором одновременно есть:

```text
package.json
.git/
src/
vite.config.ts
```

Если `find` покажет, например:

```text
./growth-peak.pro/repo/package.json
./growth-peak.pro/repo/.git
```

значит рабочий каталог будет:

```bash
cd /home/gro7659365/growth-peak.pro/repo
```

### 2. Проверить, что это правильный каталог

Внутри найденного каталога выполнить:

```bash
pwd
ls -la
git status --short
ls package.json vite.config.ts src
```

Если `package.json`, `vite.config.ts` и `src` видны — это frontend-корень.

### 3. Обновить код

```bash
git pull
```

Если снова будет конфликт по `README.md`, как раньше, сначала:

```bash
git checkout -- README.md
git pull
```

### 4. Установить зависимости

Так как `package-lock.json` может отсутствовать, используем не `npm ci`, а:

```bash
npm install
```

### 5. Собрать frontend

```bash
npm run build
```

После успешной сборки должна появиться/обновиться папка:

```text
dist/
```

## Если `dist` собирается не там, откуда раздаёт сайт

Тогда нужно скопировать собранный frontend в web-root. Это зависит от структуры сервера. После сборки проверьте:

```bash
ls -la dist
ls -la /home/gro7659365/growth-peak.pro/docs
```

Если `/docs` — это публичная папка сайта, а сборка лежит в другом каталоге, команда будет примерно такая:

```bash
rsync -av --delete dist/ /home/gro7659365/growth-peak.pro/docs/
```

Но выполнять `rsync --delete` стоит только после подтверждения, что `/docs` действительно публичная папка фронта, а backend не лежит внутри неё критично для сайта.

## Что не делать

- Не запускать `npm run build` из `/docs`, если там нет `package.json`.
- Не запускать `npm ci`, если нет `package-lock.json`.
- Не трогать Laravel, миграции и базу — это изменение только frontend.

## Минимальный следующий шаг

Пришлите вывод этой команды:

```bash
cd /home/gro7659365 && find . -maxdepth 5 -name package.json -o -name .git 2>/dev/null

[gro7659365@gro7659365 ~]$ find . -maxdepth 5 -name package.json -o -name .git 2>/dev/null
./growth-peak.pro/docs/backend/.git
./growth-peak.pro/docs/backend/package.json
./.nvm/.git
./.nvm/package.json

```

По нему я скажу точный `cd ...` и финальные команды.

View History

&nbsp;

Troubleshooting docs
&nbsp;