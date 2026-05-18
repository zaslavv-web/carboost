import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { laravelStorage } from "../storage";
import { laravelAuth } from "../client";

describe("laravelStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it("upload sends multipart/form-data with auth header", async () => {
    laravelAuth.setToken("tok");
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ data: { path: "p", fullPath: "fp", url: null } }),
    });
    const file = new Blob(["hello"], { type: "text/plain" });
    const r = await laravelStorage.from("docs").upload("a/b.txt", file, { upsert: true });
    expect(r.error).toBeNull();
    expect(r.data?.path).toBe("p");
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toMatch(/\/api\/storage\/docs\/upload$/);
    expect(init.method).toBe("POST");
    expect((init.headers as any).Authorization).toBe("Bearer tok");
    expect(init.body).toBeInstanceOf(FormData);
    const fd = init.body as FormData;
    expect(fd.get("path")).toBe("a/b.txt");
    expect(fd.get("upsert")).toBe("1");
    expect(fd.get("file")).toBeInstanceOf(Blob);
  });

  it("createSignedUrl returns signed url", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({ data: { signedUrl: "https://x/y?sig=1" } }),
    });
    const r = await laravelStorage.from("docs").createSignedUrl("a/b.txt", 120);
    expect(r.data?.signedUrl).toBe("https://x/y?sig=1");
    const [url] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toContain("/api/storage/docs/sign?");
    expect(url).toContain("path=a%2Fb.txt");
    expect(url).toContain("ttl=120");
  });

  it("getPublicUrl composes URL", () => {
    const r = laravelStorage.from("avatars").getPublicUrl("u/1.png");
    expect(r.data.publicUrl).toMatch(/\/storage\/avatars\/u\/1\.png$/);
  });

  it("remove sends DELETE with JSON body", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ data: { deleted: 2 } }),
    });
    const r = await laravelStorage.from("docs").remove(["a", "b"]);
    expect(r.data?.deleted).toBe(2);
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ paths: ["a", "b"] });
  });
});
