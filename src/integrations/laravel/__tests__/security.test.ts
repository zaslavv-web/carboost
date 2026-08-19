import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { security } from "../security";

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

describe("security api", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it("stats() throws with backend message on error", async () => {
    mockJson({ message: "denied" }, 403);
    await expect(security.stats()).rejects.toThrow("denied");
  });

  it("listProviders() GETs /security/providers", async () => {
    mockJson({ data: [], endpoints: {} });
    await security.listProviders();
    expect(String(lastCall()[0])).toContain("/security/providers");
  });

  it("createProvider() posts provider body", async () => {
    mockJson({ ok: true, id: "p1" });
    await security.createProvider({ kind: "oidc", title: "Google" } as any);
    const [url, init] = lastCall();
    expect(String(url)).toContain("/security/providers");
    expect(JSON.parse(init.body)).toEqual({ kind: "oidc", title: "Google" });
  });

  it("createScimToken() posts name", async () => {
    mockJson({ ok: true, id: "t1", token: "secret" });
    await security.createScimToken("CI token");
    const [, init] = lastCall();
    expect(JSON.parse(init.body)).toEqual({ name: "CI token" });
  });

  it("listAudit() builds query from all provided filters", async () => {
    mockJson({ data: [] });
    await security.listAudit({ severity: "critical", category: "auth", search: "login", limit: 50 });
    const url = String(lastCall()[0]);
    expect(url).toContain("severity=critical");
    expect(url).toContain("category=auth");
    expect(url).toContain("search=login");
    expect(url).toContain("limit=50");
  });

  it("listAudit() omits params entirely when none given", async () => {
    mockJson({ data: [] });
    await security.listAudit();
    expect(String(lastCall()[0])).toMatch(/\/security\/audit$/);
  });

  it("auditExportUrl() builds a URL without hitting the network", () => {
    expect(security.auditExportUrl("csv")).toMatch(/\/security\/audit\/export\?format=csv$/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("assignRole()/unassignRole() hit member endpoints", async () => {
    mockJson({ ok: true, added: 2 });
    await security.assignRole("role1", ["u1", "u2"]);
    let [url, init] = lastCall();
    expect(String(url)).toContain("/security/roles/role1/members");
    expect(JSON.parse(init.body)).toEqual({ user_ids: ["u1", "u2"] });

    mockJson({ ok: true });
    await security.unassignRole("role1", "u1");
    [url, init] = lastCall();
    expect(String(url)).toContain("/security/roles/role1/members/u1");
    expect(init.method).toBe("DELETE");
  });

  it("twoFactorConfirm() posts code and returns backup codes", async () => {
    mockJson({ ok: true, backup_codes: ["a", "b"] });
    const res = await security.twoFactorConfirm("123456");
    expect(res.backup_codes).toEqual(["a", "b"]);
    const [url, init] = lastCall();
    expect(String(url)).toContain("/auth/2fa/confirm");
    expect(JSON.parse(init.body)).toEqual({ code: "123456" });
  });
});
