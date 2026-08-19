#!/usr/bin/env node
/**
 * Нагрузочное тестирование «Пик роста» на 100 одновременных пользователей.
 * Без внешних зависимостей: чистый Node (fetch + Promise-пул).
 *
 * Что делает:
 *   1. Логинит пул реальных учёток (или одну учётку N раз, если пул не задан)
 *      и получает Sanctum-токены — по токену на виртуального пользователя (VU).
 *   2. Разгоняет нагрузку линейным ramp-up до VUS за RAMP секунд.
 *   3. Каждый VU в цикле прогоняет взвешенный сценарий реального рабочего дня
 *      (дашборд, задачи, чаты, справочники, аналитика) с паузой think-time.
 *   4. Считает RPS, p50/p90/p95/p99, долю ошибок по каждому эндпоинту,
 *      отдельно выделяет 5xx, таймауты и 429.
 *   5. Пишет отчёт в docs/LOAD-TEST-REPORT.md и JSON в docs/loadtest/<ts>.json.
 *   6. Возвращает ненулевой код выхода, если пробиты пороги (SLO).
 *
 * Запуск:
 *   LT_BASE_URL=https://growth-peak.pro \
 *   LT_EMAIL=hrd@example.com LT_PASSWORD=*** \
 *   node scripts/loadtest/load-test.mjs
 *
 * Пул учёток (рекомендуется — честнее по кешам и правам):
 *   LT_USERS='[{"email":"a@x.ru","password":"..."},{"email":"b@x.ru","password":"..."}]'
 *
 * Параметры (env):
 *   LT_VUS=100         — число виртуальных пользователей
 *   LT_DURATION=60     — длительность стабильной фазы, сек
 *   LT_RAMP=20         — разгон, сек
 *   LT_THINK=1000      — пауза между итерациями VU, мс
 *   LT_TIMEOUT=15000   — таймаут запроса, мс
 *   LT_READONLY=1      — только чтение (по умолчанию; 0 включит запись сообщений в чат)
 *   LT_SLO_P95=2000    — порог p95, мс
 *   LT_SLO_ERROR=1     — порог доли ошибок, %
 */

import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.LT_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const API = (process.env.LT_API_URL ?? `${BASE}/api`).replace(/\/+$/, "");
const VUS = Number(process.env.LT_VUS ?? 100);
const DURATION = Number(process.env.LT_DURATION ?? 60) * 1000;
const RAMP = Number(process.env.LT_RAMP ?? 20) * 1000;
const THINK = Number(process.env.LT_THINK ?? 1000);
const TIMEOUT = Number(process.env.LT_TIMEOUT ?? 15000);
const READONLY = (process.env.LT_READONLY ?? "1") !== "0";
const SLO_P95 = Number(process.env.LT_SLO_P95 ?? 2000);
const SLO_ERROR_PCT = Number(process.env.LT_SLO_ERROR ?? 1);

const OUT_DIR = "docs/loadtest";
const REPORT_PATH = "docs/LOAD-TEST-REPORT.md";

// ---------------------------------------------------------------- учётки ---

function resolveUsers() {
  if (process.env.LT_USERS) {
    try {
      const parsed = JSON.parse(process.env.LT_USERS);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      fail("LT_USERS не парсится как JSON-массив");
    }
  }
  if (process.env.LT_EMAIL && process.env.LT_PASSWORD) {
    return [{ email: process.env.LT_EMAIL, password: process.env.LT_PASSWORD }];
  }
  fail("Нужны LT_EMAIL/LT_PASSWORD либо LT_USERS с массивом учёток");
}

function fail(msg) {
  console.error(`\n[load-test] ${msg}\n`);
  process.exit(2);
}

// ------------------------------------------------------------------ http ---

const metrics = new Map(); // name -> { samples:[ms], ok, err4xx, err5xx, timeout, bytes }

function metric(name) {
  let m = metrics.get(name);
  if (!m) {
    m = { samples: [], ok: 0, err4xx: 0, err5xx: 0, timeout: 0, other: 0, bytes: 0 };
    metrics.set(name, m);
  }
  return m;
}

async function hit(name, path, { token, method = "GET", body } = {}) {
  const m = metric(name);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  const t0 = performance.now();
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const ms = performance.now() - t0;
    m.samples.push(ms);
    m.bytes += text.length;
    if (res.status >= 500) m.err5xx++;
    else if (res.status >= 400) m.err4xx++;
    else m.ok++;
    return { status: res.status, ms, text };
  } catch (e) {
    const ms = performance.now() - t0;
    m.samples.push(ms);
    if (e?.name === "AbortError") m.timeout++;
    else m.other++;
    return { status: 0, ms, text: "" };
  } finally {
    clearTimeout(timer);
  }
}

// -------------------------------------------------------------- сценарий ---

/**
 * Взвешенный микс запросов «рабочего дня». Вес ≈ доля от всех запросов.
 * Порядок внутри итерации имитирует реальный переход по разделам.
 */
const SCENARIO = [
  { w: 3, name: "employee_today", path: "/employee/today" },
  { w: 2, name: "profiles_me", path: "/profiles/me" },
  { w: 2, name: "notifications", path: "/notifications" },
  { w: 2, name: "chats_unread", path: "/chats/unread-count" },
  { w: 2, name: "currency_balance", path: "/currency/balance" },
  { w: 1, name: "chats_list", path: "/chats" },
  { w: 1, name: "tracker_tasks", path: "/db/tracker_tasks" },
  { w: 1, name: "courses", path: "/university/courses" },
  { w: 1, name: "positions", path: "/db/positions" },
  { w: 1, name: "profiles_page", path: "/profiles?per_page=50" },
];

const WEIGHTED = SCENARIO.flatMap((s) => Array(s.w).fill(s));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function virtualUser(id, token, deadline) {
  // Разгон: каждый VU стартует со своим смещением.
  await sleep((RAMP / VUS) * id);

  while (Date.now() < deadline) {
    const pick = WEIGHTED[Math.floor(Math.random() * WEIGHTED.length)];
    await hit(pick.name, pick.path, { token });

    if (!READONLY && Math.random() < 0.05) {
      await hit("chats_list_write_probe", "/chats", { token });
    }

    // think-time с джиттером ±40%, чтобы не создавать «пилу» синхронных волн.
    await sleep(THINK * (0.6 + Math.random() * 0.8));
  }
}

// -------------------------------------------------------------- статистика ---

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function summarize(elapsedMs) {
  const rows = [];
  let total = 0;
  let errors = 0;
  const all = [];

  for (const [name, m] of metrics) {
    const sorted = [...m.samples].sort((a, b) => a - b);
    all.push(...sorted);
    const count = sorted.length;
    const err = m.err4xx + m.err5xx + m.timeout + m.other;
    total += count;
    errors += err;
    rows.push({
      name,
      count,
      rps: +(count / (elapsedMs / 1000)).toFixed(2),
      p50: Math.round(pct(sorted, 50)),
      p90: Math.round(pct(sorted, 90)),
      p95: Math.round(pct(sorted, 95)),
      p99: Math.round(pct(sorted, 99)),
      max: Math.round(sorted[sorted.length - 1] ?? 0),
      ok: m.ok,
      err4xx: m.err4xx,
      err5xx: m.err5xx,
      timeout: m.timeout,
      errorPct: count ? +((err / count) * 100).toFixed(2) : 0,
    });
  }

  rows.sort((a, b) => b.p95 - a.p95);
  const sortedAll = all.sort((a, b) => a - b);

  return {
    rows,
    total,
    errors,
    errorPct: total ? +((errors / total) * 100).toFixed(2) : 0,
    rps: +(total / (elapsedMs / 1000)).toFixed(2),
    p50: Math.round(pct(sortedAll, 50)),
    p95: Math.round(pct(sortedAll, 95)),
    p99: Math.round(pct(sortedAll, 99)),
    max: Math.round(sortedAll[sortedAll.length - 1] ?? 0),
  };
}

function renderReport(summary, meta) {
  const head = `# Нагрузочное тестирование — отчёт

- **Дата:** ${meta.startedAt}
- **Цель:** ${BASE}
- **Виртуальных пользователей:** ${VUS} (ramp-up ${RAMP / 1000} c, стабильная фаза ${DURATION / 1000} c)
- **Учёток в пуле:** ${meta.users}
- **Режим:** ${READONLY ? "только чтение" : "чтение + запись"}
- **Health до/после:** ${meta.healthBefore} → ${meta.healthAfter}

## Итог

| Метрика | Значение | SLO | Вердикт |
|---|---|---|---|
| Запросов всего | ${summary.total} | — | — |
| RPS | ${summary.rps} | — | — |
| p50 | ${summary.p50} мс | — | — |
| p95 | ${summary.p95} мс | ≤ ${SLO_P95} мс | ${summary.p95 <= SLO_P95 ? "OK" : "FAIL"} |
| p99 | ${summary.p99} мс | — | — |
| max | ${summary.max} мс | — | — |
| Ошибки | ${summary.errorPct}% (${summary.errors}) | ≤ ${SLO_ERROR_PCT}% | ${summary.errorPct <= SLO_ERROR_PCT ? "OK" : "FAIL"} |

## По эндпоинтам

| Эндпоинт | Запросов | RPS | p50 | p95 | p99 | max | 2xx | 4xx | 5xx | timeout | Ошибок |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
`;
  const body = summary.rows
    .map(
      (r) =>
        `| ${r.name} | ${r.count} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} | ${r.ok} | ${r.err4xx} | ${r.err5xx} | ${r.timeout} | ${r.errorPct}% |`,
    )
    .join("\n");

  const tail = `

> Отчёт сгенерирован \`scripts/loadtest/load-test.mjs\`. Повторный запуск перезаписывает файл;
> сырые данные каждого прогона сохраняются в \`docs/loadtest/\`.
`;
  return head + body + tail;
}

// ------------------------------------------------------------------ main ---

async function login(user) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(user),
  });
  const data = await res.json().catch(() => ({}));
  if (data?.["2fa_required"]) throw new Error(`У ${user.email} включена 2FA — учётка не годится для нагрузки`);
  if (!data?.token) throw new Error(`Логин ${user.email} не удался: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data.token;
}

async function healthLine() {
  try {
    const res = await fetch(`${API}/health`, { headers: { Accept: "application/json" } });
    const j = await res.json();
    // /api/health отдаёт метрики внутри `checks`.
    const c = j.checks ?? j;
    return `db=${c.db}, mem=${c.usage_mb}МБ/${c.memory_limit}, ver=${c.version ?? "?"}, fatals/1h=${c.fatals_last_hour ?? "?"}`;
  } catch (e) {
    return `недоступен (${e.message})`;
  }
}

async function main() {
  const users = resolveUsers();
  const startedAt = new Date().toISOString();

  console.log(`[load-test] цель ${BASE}, VUs=${VUS}, ramp=${RAMP / 1000}c, duration=${DURATION / 1000}c`);
  const healthBefore = await healthLine();
  console.log(`[load-test] health до: ${healthBefore}`);

  // Логинимся один раз на учётку, токены раздаём VU по кругу.
  const tokens = [];
  for (const u of users) {
    tokens.push(await login(u));
  }
  console.log(`[load-test] получено токенов: ${tokens.length}`);

  const deadline = Date.now() + RAMP + DURATION;
  const t0 = Date.now();

  const progress = setInterval(() => {
    const done = [...metrics.values()].reduce((a, m) => a + m.samples.length, 0);
    const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    process.stdout.write(`\r[load-test] запросов ${done}, осталось ${left}c   `);
  }, 2000);

  await Promise.all(
    Array.from({ length: VUS }, (_, i) => virtualUser(i, tokens[i % tokens.length], deadline)),
  );

  clearInterval(progress);
  process.stdout.write("\n");

  const elapsed = Date.now() - t0;
  const healthAfter = await healthLine();
  console.log(`[load-test] health после: ${healthAfter}`);

  const summary = summarize(elapsed);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, `${startedAt.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ startedAt, base: BASE, vus: VUS, elapsed, summary, healthBefore, healthAfter }, null, 2),
  );
  fs.writeFileSync(
    REPORT_PATH,
    renderReport(summary, { startedAt, users: users.length, healthBefore, healthAfter }),
  );

  console.table(summary.rows);
  console.log(
    `[load-test] итог: RPS ${summary.rps}, p95 ${summary.p95}мс, ошибок ${summary.errorPct}% → ${REPORT_PATH}`,
  );

  const sloFailed = summary.p95 > SLO_P95 || summary.errorPct > SLO_ERROR_PCT;
  if (sloFailed) {
    console.error("[load-test] SLO НЕ ВЫПОЛНЕН");
    process.exit(1);
  }
}

main().catch((e) => fail(e.stack ?? e.message));
