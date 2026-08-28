#!/usr/bin/env bash
#
# Дымовая проверка интеграционного API на живом стенде.
#
#   export GP_API_KEY='gp_xxxxxxxxxxxx_yyyy...'
#   scripts/integration-api-smoke.sh                      # только чтение
#   scripts/integration-api-smoke.sh --write              # + цикл записи
#   GP_BASE_URL=https://sandbox.example scripts/integration-api-smoke.sh
#
# По умолчанию скрипт НИЧЕГО не меняет: боевые данные трогать без спроса
# нельзя. Флаг --write включает полный цикл upsert → чтение по внешнему ключу
# → повторный upsert (проверка идемпотентности) → удаление созданной записи.
# Запись идёт в departments с внешним ключом вида SMOKE-<метка времени>,
# поэтому в реальные подразделения она не попадает и убирается за собой.
#
# Юнит-тесты покрывают логику (tests/Feature/IntegrationApiTest.php).
# Этот скрипт проверяет другое: что код доехал до стенда, маршруты
# смонтированы, ключ принимается и скоупы работают.

set -uo pipefail

BASE="${GP_BASE_URL:-https://growth-peak.pro}"
API="$BASE/api/integration/v1"
WRITE=0
[ "${1:-}" = "--write" ] && WRITE=1

if [ -z "${GP_API_KEY:-}" ]; then
  echo "Не задан GP_API_KEY. Создайте ключ: Интеграции → Ключи API." >&2
  echo "Токен показывается один раз при создании." >&2
  exit 2
fi

command -v python3 >/dev/null 2>&1 || { echo "Нужен python3 для разбора JSON" >&2; exit 2; }

PASS=0
FAIL=0

# Возвращает код ответа, тело кладёт в $BODY_FILE.
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

call() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-sS -X "$method" -o "$BODY_FILE" -w '%{http_code}'
              -H "Authorization: Bearer $GP_API_KEY"
              -H 'Accept: application/json')
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
  curl "${args[@]}" --max-time 30 "$API$path" 2>/dev/null || echo 000
}

# Проверка: ожидаемый код + необязательное python-выражение над телом.
check() {
  local title="$1" expected="$2" actual="$3" assertion="${4:-}"
  if [ "$actual" != "$expected" ]; then
    printf '  ✗ %s — ожидался HTTP %s, получен %s\n' "$title" "$expected" "$actual"
    printf '    тело: %s\n' "$(head -c 300 "$BODY_FILE")"
    FAIL=$((FAIL + 1)); return 1
  fi
  if [ -n "$assertion" ]; then
    if ! python3 -c "
import json,sys
d=json.load(open('$BODY_FILE'))
sys.exit(0 if ($assertion) else 1)
" 2>/dev/null; then
      printf '  ✗ %s — HTTP %s, но проверка тела не прошла: %s\n' "$title" "$actual" "$assertion"
      printf '    тело: %s\n' "$(head -c 300 "$BODY_FILE")"
      FAIL=$((FAIL + 1)); return 1
    fi
  fi
  printf '  ✓ %s\n' "$title"
  PASS=$((PASS + 1)); return 0
}

json() { python3 -c "import json;print(json.load(open('$BODY_FILE'))$1)" 2>/dev/null; }

echo "Стенд: $API"
echo
echo "— авторизация —"

code="$(call GET /meta/resources)"
check "ключ принят, каталог ресурсов отдан" 200 "$code" "len(d['resources'])>0"

RESOURCES="$(json "['resources']" | head -c 0; json "['resources'][0]['name']")"
echo "    ресурсов в каталоге: $(json "['resources']" | python3 -c 'import sys;print(len(eval(sys.stdin.read())))' 2>/dev/null || echo '?')"

# Ключ без Bearer и с мусором должен отбиваться — иначе защита не работает.
bad="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' --max-time 30 "$API/meta/resources" 2>/dev/null || echo 000)"
check "без ключа доступ закрыт" 401 "$bad"

bad="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' --max-time 30 \
        -H 'Authorization: Bearer gp_nosuch_key' "$API/meta/resources" 2>/dev/null || echo 000)"
check "неизвестный ключ отвергнут" 401 "$bad"

echo
echo "— чтение —"

code="$(call GET /openapi.json)"
check "схема OpenAPI отдаётся" 200 "$code" "d['openapi'].startswith('3.')"

code="$(call GET '/departments?limit=3')"
check "список подразделений" 200 "$code" "'data' in d and 'page' in d"

code="$(call GET '/employees?limit=3')"
if [ "$code" = "403" ]; then
  echo "  ⓘ сотрудники: ключу не выдан скоуп employees:read (это не ошибка)"
else
  check "список сотрудников" 200 "$code" "'data' in d"
fi

code="$(call GET '/events?limit=5')"
if [ "$code" = "403" ]; then
  echo "  ⓘ фид событий: ключу не выдан скоуп events:read"
else
  check "фид событий" 200 "$code" "'data' in d and 'next_cursor' in d['page']"
  echo "    курсор: $(json "['page']['next_cursor']")"
fi

code="$(call GET /unicorns)"
check "несуществующий ресурс → 404" 404 "$code"

if [ "$WRITE" = "0" ]; then
  echo
  echo "— запись пропущена (запустите с --write) —"
  echo
  echo "Итог: успешно $PASS, отказов $FAIL"
  [ "$FAIL" = "0" ] || exit 1
  exit 0
fi

echo
echo "— запись (создаём и удаляем временную запись) —"

EXT_ID="SMOKE-$(date -u +%Y%m%d%H%M%S)"
PAYLOAD="$(python3 -c "
import json
print(json.dumps({'external_system':'smoke-test','external_id':'$EXT_ID',
                  'data':{'name':'Проверка интеграции $EXT_ID'}}, ensure_ascii=False))")"

code="$(call POST /departments/upsert "$PAYLOAD")"
if ! check "upsert создал запись" 201 "$code" "d['created'] is True"; then
  echo "Дальше идти нет смысла — прекращаю." >&2
  echo; echo "Итог: успешно $PASS, отказов $FAIL"; exit 1
fi
CREATED_ID="$(json "['data']['id']")"
echo "    id: $CREATED_ID, внешний ключ: $EXT_ID"

code="$(call GET "/departments/ext:smoke-test:$EXT_ID")"
check "запись доступна по внешнему ключу" 200 "$code" "d['data']['id']=='$CREATED_ID'"

code="$(call POST /departments/upsert "$PAYLOAD")"
check "повторный upsert обновил ту же запись (идемпотентность)" 200 "$code" \
      "d['created'] is False and d['data']['id']=='$CREATED_ID'"

code="$(call GET '/events?limit=20&resource=departments')"
if [ "$code" = "200" ]; then
  check "событие о создании попало в фид" 200 "$code" \
        "any(e['record_id']=='$CREATED_ID' for e in d['data'])"
else
  echo "  ⓘ фид событий недоступен ключу — проверку события пропускаю"
fi

code="$(call DELETE "/departments/$CREATED_ID")"
check "временная запись удалена" 200 "$code" "d['deleted'] is True"

code="$(call GET "/departments/$CREATED_ID")"
check "после удаления запись не отдаётся" 404 "$code"

echo
echo "Итог: успешно $PASS, отказов $FAIL"
[ "$FAIL" = "0" ] || exit 1
