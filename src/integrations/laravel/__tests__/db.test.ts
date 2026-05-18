import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { laravelDb } from "../db";

function lastCall() {
  return (globalThis.fetch as any).mock.calls.at(-1) as [string, RequestInit];
}

function mockJson(body: any, status = 200) {
  (globalThis.fetch as any).mockResolvedValueOnce({
    ok: status < 300,
    status,
    statusText: "OK",
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
  });
}

describe("laravelDb query builder", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it("select with eq + order + limit builds correct URL", async () => {
    mockJson({ data: [{ id: 1 }], count: null });
    const res = await laravelDb.from("departments").select("*").eq("company_id", "c1").order("created_at", { ascending: true }).limit(10);
    expect(res.error).toBeNull();
    expect(res.data).toEqual([{ id: 1 }]);
    const [url, init] = lastCall();
    expect(init.method).toBe("GET");
    expect(url).toContain("/db/departments?");
    expect(url).toContain("select=%2A");
    expect(url).toContain("order=created_at.asc");
    expect(url).toContain("limit=10");
    expect(url).toContain("eq.company_id=c1");
  });

  it("in() joins values with comma", async () => {
    mockJson({ data: [] });
    await laravelDb.from("users").select("id").in("id", ["a", "b", "c"]);
    expect(lastCall()[0]).toContain("in.id=a%2Cb%2Cc");
  });

  it("single() adds single=1", async () => {
    mockJson({ data: { id: 1 } });
    await laravelDb.from("profiles").select("*").eq("user_id", "u1").single();
    expect(lastCall()[0]).toContain("single=1");
  });

  it("insert posts payload", async () => {
    mockJson({ data: [{ id: 1 }] });
    await laravelDb.from("notes").insert({ title: "x" });
    const [url, init] = lastCall();
    expect(init.method).toBe("POST");
    expect(url).toContain("/db/notes");
    expect(JSON.parse(init.body as string)).toEqual({ values: { title: "x" }, upsert: false, onConflict: undefined });
  });

  it("upsert sets upsert flag + onConflict", async () => {
    mockJson({ data: [] });
    await laravelDb.from("notes").upsert({ id: 1 }, { onConflict: "id" });
    const body = JSON.parse(lastCall()[1].body as string);
    expect(body.upsert).toBe(true);
    expect(body.onConflict).toBe("id");
  });

  it("update sends PATCH with filters in query", async () => {
    mockJson({ data: [] });
    await laravelDb.from("notes").update({ title: "y" }).eq("id", 5);
    const [url, init] = lastCall();
    expect(init.method).toBe("PATCH");
    expect(url).toContain("eq.id=5");
    expect(JSON.parse(init.body as string)).toEqual({ values: { title: "y" } });
  });

  it("delete sends DELETE with filters", async () => {
    mockJson({ data: [] });
    await laravelDb.from("notes").delete().eq("id", 7);
    const [url, init] = lastCall();
    expect(init.method).toBe("DELETE");
    expect(url).toContain("eq.id=7");
  });

  it("propagates error from server", async () => {
    mockJson({ message: "boom" }, 500);
    const r = await laravelDb.from("notes").select("*");
    expect(r.error?.status).toBe(500);
    expect(r.data).toBeNull();
  });
});
