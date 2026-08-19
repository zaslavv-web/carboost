import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { leavesApi } from "../leaves";

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

describe("leavesApi", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it("listTypes() defaults to only_active=1 and can be disabled", async () => {
    mockJson({ data: [{ id: "t1" }], total: 1, current_page: 1, last_page: 1 });
    await leavesApi.listTypes();
    expect(String(lastCall()[0])).toContain("/leave-types?only_active=1");

    mockJson({ data: [], total: 0, current_page: 1, last_page: 1 });
    await leavesApi.listTypes(false);
    expect(String(lastCall()[0])).toMatch(/\/leave-types$/);
  });

  it("listTypes() throws when backend errors", async () => {
    mockJson({ message: "denied" }, 403);
    await expect(leavesApi.listTypes()).rejects.toThrow("denied");
  });

  it("listBalances() appends user_id filter when provided", async () => {
    mockJson({ data: [], total: 0, current_page: 1, last_page: 1 });
    await leavesApi.listBalances("u1");
    expect(String(lastCall()[0])).toContain("/leave-balances?user_id=u1");
  });

  it("listRequests() sends scope and optional status", async () => {
    mockJson({ data: [], total: 0, current_page: 1, last_page: 1 });
    await leavesApi.listRequests("inbox", "pending_manager");
    const url = String(lastCall()[0]);
    expect(url).toContain("scope=inbox");
    expect(url).toContain("status=pending_manager");
  });

  it("createRequest() posts the leave request payload", async () => {
    mockJson({ id: "r1" });
    const payload = { leave_type_id: "lt1", start_date: "2024-01-01", end_date: "2024-01-05" };
    await leavesApi.createRequest(payload);
    const [url, init] = lastCall();
    expect(String(url)).toContain("/leave-requests");
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it("approve()/reject()/cancel() call correct actions", async () => {
    mockJson({ id: "r1", status: "approved" });
    await leavesApi.approve("r1", "ok");
    let [url, init] = lastCall();
    expect(String(url)).toContain("/leave-requests/r1/approve");
    expect(JSON.parse(init.body)).toEqual({ comment: "ok" });

    mockJson({ id: "r1", status: "rejected" });
    await leavesApi.reject("r1", "no budget");
    [url, init] = lastCall();
    expect(String(url)).toContain("/leave-requests/r1/reject");
    expect(JSON.parse(init.body)).toEqual({ comment: "no budget" });

    mockJson({ id: "r1", status: "cancelled" });
    await leavesApi.cancel("r1");
    [url, init] = lastCall();
    expect(String(url)).toContain("/leave-requests/r1/cancel");
    expect(init.method).toBe("POST");
  });

  it("listCompensations() and calculateCompensation()", async () => {
    mockJson({ data: [], total: 0, current_page: 1, last_page: 1 });
    await leavesApi.listCompensations();
    expect(String(lastCall()[0])).toMatch(/\/leave-compensations$/);

    mockJson({ id: "comp1" });
    await leavesApi.calculateCompensation({ user_id: "u1", daily_rate: 100 });
    const [url, init] = lastCall();
    expect(String(url)).toContain("/leave-compensations/calculate");
    expect(JSON.parse(init.body)).toEqual({ user_id: "u1", daily_rate: 100 });
  });

  it("markCompensationPaid() posts to paid endpoint", async () => {
    mockJson({ id: "comp1", paid_at: "now" });
    await leavesApi.markCompensationPaid("comp1");
    const [url, init] = lastCall();
    expect(String(url)).toContain("/leave-compensations/comp1/paid");
    expect(init.method).toBe("POST");
  });
});
