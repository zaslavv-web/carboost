import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { kedo } from "../kedo";

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

describe("kedo api", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it("stats() throws with error message on failure", async () => {
    mockJson({ message: "boom" }, 500);
    await expect(kedo.stats()).rejects.toThrow("boom");
  });

  it("listTemplates() returns data wrapper", async () => {
    mockJson({ data: [{ id: "t1" }] });
    await expect(kedo.listTemplates()).resolves.toEqual({ data: [{ id: "t1" }] });
    expect(String(lastCall()[0])).toContain("/kedo/templates");
  });

  it("listDocuments() builds query from params", async () => {
    mockJson({ data: [] });
    await kedo.listDocuments({ status: "signed", search: "test" });
    const url = String(lastCall()[0]);
    expect(url).toContain("status=signed");
    expect(url).toContain("search=test");
  });

  it("bulkCreate() posts scope payload", async () => {
    mockJson({ ok: true, created: 5 });
    await kedo.bulkCreate({ template_id: "t1", scope_type: "company" });
    const [url, init] = lastCall();
    expect(String(url)).toContain("/kedo/documents/bulk");
    expect(JSON.parse(init.body)).toEqual({ template_id: "t1", scope_type: "company" });
  });

  it("signPep() posts code", async () => {
    mockJson({ ok: true });
    await kedo.signPep("d1", "123456");
    const [url, init] = lastCall();
    expect(String(url)).toContain("/kedo/documents/d1/sign-pep");
    expect(JSON.parse(init.body)).toEqual({ code: "123456" });
  });

  it("signUkep() sends FormData with file and metadata", async () => {
    mockJson({ ok: true });
    const file = new File(["sig"], "sig.p7s");
    await kedo.signUkep("d1", file, { provider: "crypto-pro" });
    const [url, init] = lastCall();
    expect(String(url)).toContain("/kedo/documents/d1/sign-ukep");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("provider")).toBe("crypto-pro");
    expect((init.body as FormData).get("signature")).toBe(file);
  });

  it("verify() GETs the verify endpoint", async () => {
    mockJson({ ok: true, events: 3, broken_event_id: null, head_hash: "h", retention_until: null });
    await kedo.verify("d1");
    expect(String(lastCall()[0])).toContain("/kedo/documents/d1/verify");
  });

  it("dispatchToEdo() posts connection and document ids", async () => {
    mockJson({ ok: true, queued: 2 });
    await kedo.dispatchToEdo("conn1", ["d1", "d2"]);
    const [url, init] = lastCall();
    expect(String(url)).toContain("/kedo/edo/dispatch");
    expect(JSON.parse(init.body)).toEqual({ connection_id: "conn1", document_ids: ["d1", "d2"] });
  });

  it("deleteTemplate() sends DELETE", async () => {
    mockJson({ ok: true });
    await kedo.deleteTemplate("t1");
    const [url, init] = lastCall();
    expect(String(url)).toContain("/kedo/templates/t1");
    expect(init.method).toBe("DELETE");
  });
});
