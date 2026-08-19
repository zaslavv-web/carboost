/**
 * Альтернативный сценарий для k6 (если k6 установлен в CI/на стенде).
 * Node-версия (load-test.mjs) не требует установки и даёт тот же профиль.
 *
 * Запуск:
 *   k6 run -e BASE_URL=https://growth-peak.pro -e EMAIL=... -e PASSWORD=... scripts/loadtest/k6-100vu.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE = `${__ENV.BASE_URL || "http://localhost:8080"}/api`;

export const options = {
  stages: [
    { duration: "20s", target: 100 }, // ramp-up до 100 VU
    { duration: "60s", target: 100 }, // стабильная полка
    { duration: "10s", target: 0 },   // сброс
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000"],
  },
};

const loginTrend = new Trend("login_duration");
const serverErrors = new Rate("server_errors_5xx");

export function setup() {
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: __ENV.EMAIL, password: __ENV.PASSWORD }),
    { headers: { "Content-Type": "application/json", Accept: "application/json" } },
  );
  loginTrend.add(res.timings.duration);
  const token = res.json("token");
  if (!token) throw new Error(`login failed: ${res.status} ${res.body}`);
  return { token };
}

const ENDPOINTS = [
  "/employee/today",
  "/profiles/me",
  "/notifications",
  "/chats/unread-count",
  "/currency/balance",
  "/chats",
  "/db/tracker_tasks",
  "/db/courses",
  "/db/positions",
  "/profiles?per_page=50",
];

export default function (data) {
  const params = {
    headers: { Accept: "application/json", Authorization: `Bearer ${data.token}` },
    tags: {},
  };

  const path = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  params.tags.endpoint = path;
  const res = http.get(`${BASE}${path}`, params);

  serverErrors.add(res.status >= 500);
  check(res, {
    "нет 5xx": (r) => r.status < 500,
    "ответ < 3s": (r) => r.timings.duration < 3000,
  });

  sleep(0.6 + Math.random() * 0.8);
}
