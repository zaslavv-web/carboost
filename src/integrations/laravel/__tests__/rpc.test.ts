import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { laravelRpc } from "../rpc";

describe("laravelRpc", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it("POSTs to /api/rpc/<name> with { params }", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({ result: 42 }),
    });
    const r = await laravelRpc("verify_user", { user_id: "u-1" });
    expect(r.error).toBeNull();
    expect(r.data).toEqual({ result: 42 });
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toMatch(/\/api\/rpc\/verify_user$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ params: { user_id: "u-1" } });
  });

  it("returns error on 403", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({ message: "Недостаточно прав" }),
    });
    const r = await laravelRpc("delete_user", { user_id: "x" });
    expect(r.error?.status).toBe(403);
    expect(r.error?.message).toBe("Недостаточно прав");
  });
});
