## Проблема

В `.github/workflows/npm-publish.yml`, шаг **Deploy backend**:

1. `APP_KEY_VALUE` присваивается из SSH (может вернуть пусто).
2. `export APP_KEY_VALUE` выполняется **только если** в `app-src/.env` есть маркер `__PRESERVE_SERVER_APP_KEY__`.
3. Сейчас GitHub secret `APP_KEY` задан → предыдущий шаг записал реальный ключ → маркера нет → `export` не сработал.
4. Python-валидатор делает `os.environ['APP_KEY_VALUE']` → `KeyError`.

## Решение

Переписать начало шага **Deploy backend** так, чтобы `APP_KEY_VALUE` всегда заполнялся и экспортировался — из реального `.env` (который уже содержит финальный ключ от прошлого шага), а fallback на серверное значение оставить только для совместимости.

### Новая логика шага

```bash
# 1. Берём APP_KEY из уже сгенерированного .env
APP_KEY_VALUE="$(awk -F= '/^APP_KEY=/{sub(/^APP_KEY=/,""); gsub(/^"|"$/,""); print; exit}' app-src/.env)"

# 2. Если там оказался маркер — подменяем на серверный
if [[ "$APP_KEY_VALUE" == "__PRESERVE_SERVER_APP_KEY__" ]]; then
  SERVER_APP_KEY="$(ssh ... "awk ... .env")"
  if [[ -z "$SERVER_APP_KEY" ]]; then
    echo "APP_KEY GitHub secret is missing and no existing server APP_KEY was found."
    exit 1
  fi
  APP_KEY_VALUE="$SERVER_APP_KEY"
  python3 -c "from pathlib import Path; ...replace marker..."
fi

# 3. Всегда экспортируем перед валидатором
export APP_KEY_VALUE

python3 - <<'PY'
... валидация длины ключа ...
PY
```

### Дополнительно

- Добавить `set -u`-friendly fallback: `APP_KEY_VALUE="${APP_KEY_VALUE:-}"` перед валидатором, чтобы при пустом значении выдавать понятную ошибку, а не `KeyError`.
- Валидатор: при `len(raw) not in (16,32)` или пустом ключе писать на русском: «APP_KEY невалиден или отсутствует — задайте GitHub secret APP_KEY в формате `base64:...`».

## Файлы

- `.github/workflows/npm-publish.yml` — заменить блок шага **Deploy backend** (строки ~215–250).

## После мерджа

1. Workflow проходит зелёным, бэкенд деплоится.
2. На сервере в `/var/www/.../backend/.env` теперь лежит правильный `APP_KEY` из GitHub secret.
3. Суперадмин заходит в Email Settings → сохраняет SMTP-пароль Яндекса заново → восстановление пароля работает.
