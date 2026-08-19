import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { predictiveApi } from "../predictive";

function mockJson(body: any, status = 200) {
  (globalThis.fetch as any).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Err",
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
  });
}
function lastCall() {
  const calls = (globalThis.fetch as any).mock.calls;
  return calls[calls.length - 1];
}

describe("predictiveApi", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it("overview() GETs /predictive/overview and throws on error", async () => {
    mockJson({ message: "fail" }, 500);
    await expect(predictiveApi.overview()).rejects.toThrow("fail");

    mockJson({ headcount: 10 });
    const res = await predictiveApi.overview();
    expect(res).toEqual({ headcount: 10 });
    expect(String(lastCall()[0])).toContain("/predictive/overview");
  });

  it("recompute() posts horizon_days default 180", async () => {
    mockJson({ updated: 1, base_rate: 0.1 });
    await predictiveApi.recompute();
    const [url, init] = lastCall();
    expect(String(url)).toContain("/predictive/recompute");
    expect(JSON.parse(init.body)).toEqual({ horizon_days: 180 });
  });

  it("employees() filters out falsy params and returns array", async () => {
    mockJson({ data: [{ user_id: "u1" }] });
    const res = await predictiveApi.employees({ band: "high", department: "", search: undefined as any });
    const url = String(lastCall()[0]);
    expect(url).toContain("band=high");
    expect(url).not.toContain("department=");
    expect(res).toEqual([{ user_id: "u1" }]);
  });

  it("drivers() appends department only when provided", async () => {
    mockJson({ sample: 0, drivers: [] });
    await predictiveApi.drivers();
    expect(String(lastCall()[0])).toMatch(/\/predictive\/drivers$/);

    mockJson({ sample: 0, drivers: [] });
    await predictiveApi.drivers("IT department");
    expect(String(lastCall()[0])).toContain("department=IT%20department");
  });

  it("whatIf() posts levers and replacement_cost", async () => {
    mockJson({ headcount: 5 });
    await predictiveApi.whatIf({ workload: 1 }, 1000);
    const [, init] = lastCall();
    expect(JSON.parse(init.body)).toEqual({ levers: { workload: 1 }, replacement_cost: 1000 });
  });

  it("deleteScenario() sends DELETE", async () => {
    mockJson({ ok: true });
    await predictiveApi.deleteScenario("s1");
    const [url, init] = lastCall();
    expect(String(url)).toContain("/predictive/scenarios/s1");
    expect(init.method).toBe("DELETE");
  });
});
