import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { talentReviewApi } from "../talentReview";

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

describe("talentReviewApi", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it("listSessions() unwraps { data } and returns [] when missing", async () => {
    mockJson({ data: [{ id: "s1" }] });
    await expect(talentReviewApi.listSessions()).resolves.toEqual([{ id: "s1" }]);

    mockJson({});
    await expect(talentReviewApi.listSessions()).resolves.toEqual([]);
  });

  it("createSession() posts payload and throws on error", async () => {
    mockJson({ message: "bad" }, 422);
    await expect(talentReviewApi.createSession({ title: "Q1" })).rejects.toThrow("bad");

    mockJson({ id: "s1", title: "Q1" });
    await talentReviewApi.createSession({ title: "Q1" });
    const [url, init] = lastCall();
    expect(String(url)).toContain("/talent-review/sessions");
    expect(JSON.parse(init.body)).toEqual({ title: "Q1" });
  });

  it("grid() fetches session grid", async () => {
    mockJson({ session: { id: "s1" }, cols: 3, rows: [] });
    await talentReviewApi.grid("s1");
    expect(String(lastCall()[0])).toContain("/talent-review/sessions/s1/grid");
  });

  it("saveRatings() posts ratings array", async () => {
    mockJson({ ok: true });
    const ratings = [{ user_id: "u1", perf_level: 2, pot_level: 1 }];
    await talentReviewApi.saveRatings("s1", ratings);
    const [url, init] = lastCall();
    expect(String(url)).toContain("/talent-review/sessions/s1/ratings");
    expect(JSON.parse(init.body)).toEqual({ ratings });
  });

  it("buildPool() posts to build-pool endpoint", async () => {
    mockJson({ ok: true, added: 3 });
    await talentReviewApi.buildPool("s1");
    const [url, init] = lastCall();
    expect(String(url)).toContain("/talent-review/sessions/s1/build-pool");
    expect(init.method).toBe("POST");
  });

  it("addCandidate() posts to succession-plans candidates endpoint", async () => {
    mockJson({ id: "cand1" });
    await talentReviewApi.addCandidate("plan1", { user_id: "u2", readiness: "ready_now" });
    const [url, init] = lastCall();
    expect(String(url)).toContain("/succession-plans/plan1/candidates");
    expect(JSON.parse(init.body)).toEqual({ user_id: "u2", readiness: "ready_now" });
  });

  it("removePoolMember() sends DELETE", async () => {
    mockJson({ ok: true });
    await talentReviewApi.removePoolMember("m1");
    const [url, init] = lastCall();
    expect(String(url)).toContain("/talent-pool/m1");
    expect(init.method).toBe("DELETE");
  });
});
