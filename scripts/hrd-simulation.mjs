#!/usr/bin/env node
/**
 * HRD-simulation: имитирует действия HRD Demo_Doom на боевом growth-peak.pro
 * через тот же HTTP API, что дёргает фронт. Ловит все аномалии в findings[]
 * и пишет полный лог в docs/hrd-sim/run.log + отчёт в docs/HRD-SIMULATION-REPORT.md.
 *
 * Запуск: node scripts/hrd-simulation.mjs
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PROD_BASE_URL;
const EMAIL = process.env.PROD_HRD_EMAIL;
const PASSWORD = process.env.PROD_HRD_PASSWORD;
if (!BASE || !EMAIL || !PASSWORD) {
  console.error("Missing PROD_BASE_URL / PROD_HRD_EMAIL / PROD_HRD_PASSWORD");
  process.exit(2);
}

const LOG_DIR = "docs/hrd-sim";
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = path.join(LOG_DIR, "run.log");
const REPORT_PATH = "docs/HRD-SIMULATION-REPORT.md";
fs.writeFileSync(LOG_PATH, `# HRD-sim run ${new Date().toISOString()}\n`);

const findings = [];
let token = null;
const state = {}; // shared IDs (departmentId, positionId, templateId, ...)
const cleanup = []; // { method, path } to run in reverse in finally

function log(...args) {
  const line = args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ");
  fs.appendFileSync(LOG_PATH, line + "\n");
  console.log(line);
}

function record(finding) {
  findings.push({ ts: new Date().toISOString(), ...finding });
  log("  ⚠️ finding:", finding.severity, finding.scenario, finding.step, "-", finding.summary);
}

async function call(method, url, { body, expect = [200, 201, 204], skipRecord = false, scenario, step } = {}) {
  const full = url.startsWith("http") ? url : BASE + url;
  const started = Date.now();
  let resp, text, json;
  try {
    resp = await fetch(full, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    text = await resp.text();
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  } catch (e) {
    log(`  ${method} ${url} → FETCH_ERROR ${e.message}`);
    if (!skipRecord) record({ scenario, step, severity: "high", endpoint: `${method} ${url}`, summary: `fetch error: ${e.message}` });
    return { ok: false, status: 0, json: null, text: "" };
  }
  const ms = Date.now() - started;
  const short = (text || "").slice(0, 400).replace(/\s+/g, " ");
  log(`  ${method} ${url} → ${resp.status} (${ms}ms) ${short}`);
  if (!expect.includes(resp.status) && !skipRecord) {
    record({
      scenario, step,
      severity: resp.status >= 500 ? "critical" : resp.status === 404 ? "high" : "medium",
      endpoint: `${method} ${url}`,
      expected: expect.join("/"),
      actual: resp.status,
      summary: `unexpected ${resp.status}`,
      body: short,
    });
  }
  return { ok: expect.includes(resp.status), status: resp.status, json, text };
}

async function login() {
  const r = await call("POST", "/api/auth/login", {
    body: { email: EMAIL, password: PASSWORD },
    scenario: "auth", step: "login",
  });
  if (!r.ok || !r.json?.token) throw new Error("login failed");
  token = r.json.token;
  state.userId = r.json.user.id;
  state.companyId = r.json.user.company_id;
  log("logged in as", r.json.user.email, "company", state.companyId);
  // Профиль (UUID) для сущностей, где user_id — uuid из profiles, а не bigint auth id.
  const p = await call("GET", "/api/profiles/me", { scenario: "auth", step: "profile" });
  state.profileId = p.json?.id;
  log("profile.id", state.profileId);
}

// ---------- Scenario A: org structure & positions ----------
async function scenarioA() {
  log("\n=== Scenario A: Org structure & positions ===");
  const S = "A";

  await call("GET", "/api/profiles/me", { scenario: S, step: "profiles/me" });
  await call("GET", "/api/departments", { scenario: S, step: "list departments" });
  await call("GET", "/api/positions", { scenario: S, step: "list positions" });
  await call("GET", "/api/competencies", { scenario: S, step: "list competencies" });
  await call("GET", "/api/hr-documents", { scenario: S, step: "list hr-documents" });

  // Create department
  const depName = `SIM-DEP-${Date.now()}`;
  const dep = await call("POST", "/api/departments", {
    body: { name: depName, description: "Simulation dept" },
    scenario: S, step: "create department",
  });
  const depId = dep.json?.id || dep.json?.data?.id;
  if (depId) {
    state.depId = depId;
    cleanup.push({ method: "DELETE", url: `/api/departments/${depId}`, scenario: S });
  } else {
    record({ scenario: S, step: "create department", severity: "critical", endpoint: "POST /api/departments", summary: "no id returned", body: JSON.stringify(dep.json).slice(0, 300) });
  }

  // Create position under it (level is text, e.g. "Middle")
  if (depId) {
    const pos = await call("POST", "/api/positions", {
      body: {
        title: `SIM-POS-${Date.now()}`,
        department_id: depId,
        description: "sim position",
        level: "Middle",
      },
      scenario: S, step: "create position",
    });
    const posId = pos.json?.id || pos.json?.data?.id;
    if (posId) {
      state.posId = posId;
      cleanup.push({ method: "DELETE", url: `/api/positions/${posId}`, scenario: S });

      // second position for career path
      const pos2 = await call("POST", "/api/positions", {
        body: { title: `SIM-POS2-${Date.now()}`, department_id: depId, level: "Senior" },
        scenario: S, step: "create second position",
      });
      const pos2Id = pos2.json?.id || pos2.json?.data?.id;
      if (pos2Id) {
        state.posId2 = pos2Id;
        cleanup.push({ method: "DELETE", url: `/api/positions/${pos2Id}`, scenario: S });
      }

      // Update
      await call("PATCH", `/api/positions/${posId}`, {
        body: { description: "updated", title: "SIM-POS-updated" },
        scenario: S, step: "update position",
      });
    }
  }

  // Create competency (user_id required by schema: справочник хранится на уровне сотрудника)
  const comp = await call("POST", "/api/competencies", {
    body: {
      user_id: state.profileId || state.userId,
      skill_name: `SIM-COMP-${Date.now()}`,
      skill_value: 60,
      category: "hard",
    },
    scenario: S, step: "create competency",
  });
  const compId = comp.json?.id || comp.json?.data?.id;
  if (compId) cleanup.push({ method: "DELETE", url: `/api/competencies/${compId}`, scenario: S });

  // AI parse org structure: контракт требует fileUrl+fileName (не plain text) — сим-скрипт документирует контракт.
  // Пропускаем сам вызов (нужен реальный файл), но фиксируем ожидание:
  log("  ⓘ AI parse-org-structure требует загруженный файл — не тестируется в CLI-симуляции");

  // AI generate positions from org (departments — массив объектов с name+positions)
  await call("POST", "/api/ai/generate-positions-from-org", {
    body: {
      departments: [
        { name: "Инженерия", positions: ["Backend Engineer", "Frontend Engineer"] },
      ],
    },
    scenario: S, step: "AI generate positions", expect: [200, 201, 202, 400, 402, 423, 429, 503],
  });
}

// ---------- Scenario B: career tracks ----------
async function scenarioB() {
  log("\n=== Scenario B: Career tracks ===");
  const S = "B";
  await call("GET", "/api/career-track-templates", { scenario: S, step: "list templates" });
  await call("GET", "/api/position-career-paths", { scenario: S, step: "list paths" });

  if (!state.posId || !state.posId2) {
    record({ scenario: S, step: "prereq", severity: "high", endpoint: "-", summary: "no positions from scenario A → skipping most of B" });
    return;
  }

  // Create template
  const tpl = await call("POST", "/api/career-track-templates", {
    body: {
      title: `SIM-TRACK-${Date.now()}`,
      description: "sim track",
      motivation_text: "sim",
      estimated_months: 6,
      from_position_id: state.posId,
      to_position_id: state.posId2,
      is_active: true,
      steps: [
        { order: 1, title: "Step 1", description: "s1" },
        { order: 2, title: "Step 2", description: "s2" },
      ],
    },
    scenario: S, step: "create template",
  });
  const tplId = tpl.json?.id || tpl.json?.data?.id;
  if (tplId) {
    state.tplId = tplId;
    cleanup.push({ method: "DELETE", url: `/api/career-track-templates/${tplId}`, scenario: S });
  }

  // Create step scenario via db bridge
  if (tplId) {
    const step = await call("POST", "/api/db/career_step_scenarios", {
      body: {
        template_id: tplId,
        step_order: 1,
        requires_test: false,
        requires_files: true,
        min_files: 1,
        requires_comment: true,
        instructions: "sim instructions",
        company_id: state.companyId,
      },
      scenario: S, step: "create step scenario",
    });
    const stepId = step.json?.id || step.json?.data?.id;
    if (stepId) cleanup.push({ method: "DELETE", url: `/api/db/career_step_scenarios?id=${stepId}`, scenario: S });
  }

  // position_career_paths
  const pcp = await call("POST", "/api/position-career-paths", {
    body: {
      from_position_id: state.posId,
      to_position_id: state.posId2,
      description: "sim path",
    },
    scenario: S, step: "create position_career_path",
  });
  const pcpId = pcp.json?.id || pcp.json?.data?.id;
  if (pcpId) cleanup.push({ method: "DELETE", url: `/api/position-career-paths/${pcpId}`, scenario: S });

  // Assign track to self
  if (tplId) {
    const assign = await call("POST", "/api/db/employee_career_assignments", {
      body: {
        user_id: state.userId,
        template_id: tplId,
        company_id: state.companyId,
        status: "active",
        current_step: 0,
        personal_motivation: "sim",
      },
      scenario: S, step: "assign track to HRD self",
    });
    const aid = assign.json?.id || assign.json?.data?.id;
    if (aid) cleanup.push({ method: "DELETE", url: `/api/db/employee_career_assignments?id=${aid}`, scenario: S });
  }

  // AI generate default steps
  await call("POST", "/api/ai/generate-default-track-steps", {
    body: { from_position_id: state.posId, to_position_id: state.posId2 },
    scenario: S, step: "AI default steps", expect: [200, 201, 202, 400, 402, 429, 503],
  });

  await call("POST", "/api/ai/generate-career-paths", {
    body: { position_id: state.posId },
    scenario: S, step: "AI generate career paths", expect: [200, 201, 202, 400, 402, 429, 503],
  });
}

// ---------- Scenario C: assessment & IDP ----------
async function scenarioC() {
  log("\n=== Scenario C: Assessment & IDP ===");
  const S = "C";
  await call("GET", "/api/assessment-scenarios", { scenario: S, step: "list scenarios" });
  await call("GET", "/api/closed-question-tests", { scenario: S, step: "list closed tests" });

  const sc = await call("POST", "/api/assessment-scenarios", {
    body: {
      title: `SIM-ASSESS-${Date.now()}`,
      description: "sim scenario",
      is_active: true,
      questions: [{ text: "Test?", type: "open" }],
    },
    scenario: S, step: "create assessment scenario",
  });
  const scId = sc.json?.id || sc.json?.data?.id;
  if (scId) cleanup.push({ method: "DELETE", url: `/api/assessment-scenarios/${scId}`, scenario: S });

  // AI assessment chat
  await call("POST", "/api/ai/assessment-chat", {
    body: { scenario_id: scId, messages: [{ role: "user", content: "Hi" }] },
    scenario: S, step: "AI assessment chat", expect: [200, 201, 202, 400, 402, 429, 503],
  });

  // IDP via db bridge
  const idp = await call("POST", "/api/db/individual_development_plans", {
    body: {
      user_id: state.userId,
      company_id: state.companyId,
      created_by: state.userId,
      title: `SIM-IDP-${Date.now()}`,
      summary: "sim",
      period: "2026-Q3",
      starts_at: "2026-07-01",
      ends_at: "2026-09-30",
      status: "active",
    },
    scenario: S, step: "create IDP",
  });
  const idpId = idp.json?.id || idp.json?.data?.id;
  if (idpId) cleanup.push({ method: "DELETE", url: `/api/db/individual_development_plans?id=${idpId}`, scenario: S });

  // HR task with assignee = self
  await call("GET", "/api/db/hr_tasks", { scenario: S, step: "list hr_tasks" });
  const hr = await call("POST", "/api/db/hr_tasks", {
    body: {
      company_id: state.companyId,
      created_by: state.userId,
      title: `SIM-TASK-${Date.now()}`,
      description: "sim",
      status: "open",
      priority: "medium",
      due_at: "2026-08-01",
    },
    scenario: S, step: "create hr_task",
  });
  const hrId = hr.json?.id || hr.json?.data?.id;
  if (hrId) cleanup.push({ method: "DELETE", url: `/api/db/hr_tasks?id=${hrId}`, scenario: S });
}

// ---------- Scenario D: analytics & risks ----------
async function scenarioD() {
  log("\n=== Scenario D: Analytics & risks ===");
  const S = "D";

  await call("GET", "/api/people-analytics/headcount", { scenario: S, step: "headcount" });
  await call("GET", "/api/people-analytics/tenure", { scenario: S, step: "tenure" });
  await call("GET", "/api/people-analytics/hiring", { scenario: S, step: "hiring" });
  await call("GET", "/api/people-analytics/absence", { scenario: S, step: "absence" });
  await call("GET", "/api/people-analytics/risk", { scenario: S, step: "risk" });

  await call("POST", "/api/risks/recompute", { body: {}, scenario: S, step: "risks/recompute", expect: [200, 201, 202, 400, 429] });
  await call("GET", "/api/comfort/company", { scenario: S, step: "comfort company" });
  await call("POST", "/api/comfort/recompute", { body: {}, scenario: S, step: "comfort recompute", expect: [200, 201, 202, 400, 429] });

  await call("GET", "/api/db/employee_risk_scores", { scenario: S, step: "risk scores" });
  await call("GET", "/api/webhooks", { scenario: S, step: "webhooks list" });
  await call("GET", "/api/webhooks/events", { scenario: S, step: "webhooks events" });
  await call("GET", "/api/integrations/ical/leaves-url", { scenario: S, step: "ical url" });
}

// ---------- Cleanup ----------
async function runCleanup() {
  log("\n=== Cleanup ===");
  for (const c of cleanup.reverse()) {
    await call(c.method, c.url, { scenario: c.scenario || "cleanup", step: "cleanup", expect: [200, 201, 202, 204, 404] });
  }
}

// ---------- Report ----------
function writeReport() {
  const now = new Date().toISOString();
  const counts = findings.reduce((a, f) => ((a[f.severity] = (a[f.severity] || 0) + 1), a), {});
  const lines = [];
  lines.push(`# HRD Simulation Report`);
  lines.push(`Run: ${now}`);
  lines.push(`Target: ${BASE} · Account: ${EMAIL} · Company: ${state.companyId || "?"}`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push(`- Total findings: **${findings.length}**`);
  for (const s of ["critical", "high", "medium", "low"]) {
    if (counts[s]) lines.push(`- ${s}: ${counts[s]}`);
  }
  lines.push("");
  lines.push(`## Findings`);
  lines.push("");
  lines.push("| # | Sev | Scenario | Step | Endpoint | Expected | Actual | Summary |");
  lines.push("|---|-----|----------|------|----------|----------|--------|---------|");
  findings.forEach((f, i) => {
    lines.push(`| ${i + 1} | ${f.severity} | ${f.scenario || ""} | ${f.step || ""} | \`${f.endpoint || ""}\` | ${f.expected ?? ""} | ${f.actual ?? ""} | ${(f.summary || "").replace(/\|/g, "\\|")} |`);
  });
  lines.push("");
  lines.push(`Full request log: [docs/hrd-sim/run.log](hrd-sim/run.log)`);
  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
  log(`\nReport written: ${REPORT_PATH} (${findings.length} findings)`);
}

// ---------- Main ----------
(async () => {
  try {
    await login();
    await scenarioA();
    await scenarioB();
    await scenarioC();
    await scenarioD();
  } catch (e) {
    log("FATAL:", e.stack || e.message);
    record({ scenario: "main", step: "fatal", severity: "critical", endpoint: "-", summary: String(e.message) });
  } finally {
    try { await runCleanup(); } catch (e) { log("cleanup error", e.message); }
    writeReport();
    process.exit(findings.some((f) => f.severity === "critical") ? 1 : 0);
  }
})();
