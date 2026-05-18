import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { aiInvoke, laravel, laravelAuth } from "../client";

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetchOnce(body: any, init: { status?: number; contentType?: string; raw?: string } = {}) {
  const status = init.status ?? 200;
  const ctype = init.contentType ?? "application/json";
  const text = init.raw ?? (typeof body === "string" ? body : JSON.stringify(body));
  (globalThis.fetch as FetchMock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Err",
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? ctype : null) },
    text: async () => text,
  } as any);
}

describe("laravel client", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it("stores and reads token", () => {
    expect(laravelAuth.getToken()).toBeNull();
    laravelAuth.setToken("abc");
    expect(localStorage.getItem("laravel_token")).toBe("abc");
    expect(laravelAuth.getToken()).toBe("abc");
    laravelAuth.setToken(null);
    expect(laravelAuth.getToken()).toBeNull();
  });

  it("attaches Bearer header when token set", async () => {
    laravelAuth.setToken("tok-1");
    mockFetchOnce({ ok: true });
    await laravel.get("/auth/me");
    const [, init] = (globalThis.fetch as FetchMock).mock.calls[0];
    expect((init.headers as any).Authorization).toBe("Bearer tok-1");
  });

  it("parses JSON success response", async () => {
    mockFetchOnce({ id: 1, name: "x" });
    const r = await laravel.get("/db/things");
    expect(r.error).toBeNull();
    expect(r.data).toEqual({ id: 1, name: "x" });
  });

  it("detects HTML fallback (nginx) and returns error", async () => {
    mockFetchOnce(null, { raw: "<!doctype html><html></html>", contentType: "text/html" });
    const r = await laravel.get("/auth/me");
    expect(r.data).toBeNull();
    expect(r.error?.message).toMatch(/Backend недоступен/);
  });

  it("flattens Laravel validation errors", async () => {
    mockFetchOnce({ errors: { email: ["Уже занят"], password: ["Слишком короткий"] } }, { status: 422 });
    const r = await laravel.post("/auth/register", {});
    expect(r.error?.status).toBe(422);
    expect(r.error?.message).toContain("Уже занят");
    expect(r.error?.message).toContain("Слишком короткий");
  });

  it("uses server-provided message on error", async () => {
    mockFetchOnce({ message: "Недостаточно прав" }, { status: 403 });
    const r = await laravel.get("/db/companies");
    expect(r.error?.status).toBe(403);
    expect(r.error?.message).toBe("Недостаточно прав");
  });

  it("returns network error on throw", async () => {
    (globalThis.fetch as FetchMock).mockRejectedValueOnce(new Error("offline"));
    const r = await laravel.get("/foo");
    expect(r.error?.message).toBe("offline");
  });

  it("aiInvoke posts to /api/ai/<name>", async () => {
    mockFetchOnce({ data: { ok: true } });
    await aiInvoke("assessment-chat", { body: { message: "hi" } });
    const [url, init] = (globalThis.fetch as FetchMock).mock.calls[0];
    expect(url).toMatch(/\/api\/ai\/assessment-chat$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ message: "hi" });
  });
});
