import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { performanceApi, probationApi, disciplinaryApi, oneOnOneApi } from "../performance";

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

describe("performanceApi / probationApi / disciplinaryApi / oneOnOneApi", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it("listCycles unwraps paginated response", async () => {
    mockJson({ data: [{ id: "c1" }], total: 1, current_page: 1, last_page: 1 });
    const res = await performanceApi.listCycles();
    expect(res).toEqual([{ id: "c1" }]);
    expect(String(lastCall()[0])).toContain("/performance-cycles");
  });

  it("listCycles throws on API error", async () => {
    mockJson({ message: "nope" }, 500);
    await expect(performanceApi.listCycles()).rejects.toThrow("nope");
  });

  it("openCyclePreflight/openCycle hit correct endpoints", async () => {
    mockJson({ ok: true, employees_count: 1, existing_reviews: 0, cycle_id: "c1" });
    await performanceApi.openCyclePreflight("c1");
    expect(String(lastCall()[0])).toContain("/performance-cycles/c1/open-preflight");

    mockJson({ ok: true });
    await performanceApi.openCycle("c1");
    const [url, init] = lastCall();
    expect(String(url)).toContain("/performance-cycles/c1/open");
    expect(init.method).toBe("POST");
  });

  it("listReviews builds querystring with scope and cycle_id", async () => {
    mockJson({ data: [], total: 0, current_page: 1, last_page: 1 });
    await performanceApi.listReviews("team", "cyc-1");
    const url = String(lastCall()[0]);
    expect(url).toContain("scope=team");
    expect(url).toContain("cycle_id=cyc-1");
  });

  it("submitFeedback posts role + payload", async () => {
    mockJson({ ok: true });
    await performanceApi.submitFeedback("r1", { role: "self", overall_score: 4 });
    const [url, init] = lastCall();
    expect(String(url)).toContain("/performance-reviews/r1/feedback");
    expect(JSON.parse(init.body)).toEqual({ role: "self", overall_score: 4 });
  });

  it("probationApi.list builds qs with scope + status", async () => {
    mockJson({ data: [], total: 0, current_page: 1, last_page: 1 });
    await probationApi.list("all", "active");
    const url = String(lastCall()[0]);
    expect(url).toContain("scope=all");
    expect(url).toContain("status=active");
  });

  it("probationApi.decide posts decision payload", async () => {
    mockJson({ id: "p1" });
    await probationApi.decide("p1", { decision: "passed" });
    const [url, init] = lastCall();
    expect(String(url)).toContain("/probations/p1/decide");
    expect(JSON.parse(init.body)).toEqual({ decision: "passed" });
  });

  it("disciplinaryApi.close posts closure reason", async () => {
    mockJson({ id: "d1" });
    await disciplinaryApi.close("d1", { closure_reason: "resolved" });
    const [url, init] = lastCall();
    expect(String(url)).toContain("/disciplinary-records/d1/close");
    expect(JSON.parse(init.body)).toEqual({ closure_reason: "resolved" });
  });

  it("oneOnOneApi.list applies filters only when truthy", async () => {
    mockJson({ data: [], total: 0, current_page: 1, last_page: 1 });
    await oneOnOneApi.list("mine", { employee_id: "u1", related_type: "" });
    const url = String(lastCall()[0]);
    expect(url).toContain("employee_id=u1");
    expect(url).not.toContain("related_type=");
  });

  it("oneOnOneApi.delete calls DELETE", async () => {
    mockJson({ ok: true });
    await oneOnOneApi.delete("m1");
    const [url, init] = lastCall();
    expect(String(url)).toContain("/one-on-ones/m1");
    expect(init.method).toBe("DELETE");
  });
});
