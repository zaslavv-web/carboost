import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { laravelAuthApi } from "../auth";
import { laravelAuth } from "../client";

function mockJson(body: any, status = 200) {
  (globalThis.fetch as any).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
  });
}

describe("laravelAuthApi", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
    Object.defineProperty(window, "location", {
      value: { origin: "https://app.local", pathname: "/auth/callback", search: "", hash: "" },
      writable: true,
    });
    window.history.replaceState = vi.fn() as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it("login stores token and returns user", async () => {
    mockJson({ token: "t-1", user: { id: "u1", email: "a@b.c" } });
    const u = await laravelAuthApi.login("a@b.c", "secret123");
    expect(u.email).toBe("a@b.c");
    expect(laravelAuth.getToken()).toBe("t-1");
  });

  it("register stores token", async () => {
    mockJson({ token: "t-2", user: { id: "u2", email: "x@y.z" } }, 201);
    await laravelAuthApi.register({ email: "x@y.z", password: "secret123", full_name: "X" });
    expect(laravelAuth.getToken()).toBe("t-2");
  });

  it("me returns null when no token", async () => {
    const u = await laravelAuthApi.me();
    expect(u).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("me clears token on 401", async () => {
    laravelAuth.setToken("stale");
    mockJson({ message: "Unauthenticated" }, 401);
    const u = await laravelAuthApi.me();
    expect(u).toBeNull();
    expect(laravelAuth.getToken()).toBeNull();
  });

  it("logout clears token even when API call fails", async () => {
    laravelAuth.setToken("t-3");
    (globalThis.fetch as any).mockRejectedValueOnce(new Error("net"));
    await laravelAuthApi.logout();
    expect(laravelAuth.getToken()).toBeNull();
  });

  it("signInWithGoogle redirects to /api/auth/google/redirect", () => {
    Object.defineProperty(window, "location", { value: { ...window.location, href: "" }, writable: true });
    laravelAuthApi.signInWithGoogle("/dashboard");
    expect(window.location.href).toContain("/api/auth/google/redirect");
    expect(window.location.href).toContain("return_to=%2Fdashboard");
  });

  it("consumeOauthToken picks token from query string", () => {
    Object.defineProperty(window, "location", {
      value: { origin: "https://app.local", pathname: "/auth/callback", search: "?token=g-1", hash: "" },
      writable: true,
    });
    const res = laravelAuthApi.consumeOauthToken();
    expect(res.ok).toBe(true);
    expect(laravelAuth.getToken()).toBe("g-1");
  });

  it("consumeOauthToken picks access_token from hash", () => {
    Object.defineProperty(window, "location", {
      value: { origin: "https://app.local", pathname: "/auth/callback", search: "", hash: "#access_token=h-1" },
      writable: true,
    });
    const res = laravelAuthApi.consumeOauthToken();
    expect(res.ok).toBe(true);
    expect(laravelAuth.getToken()).toBe("h-1");
  });

  it("consumeOauthToken returns ok=false when no token present", () => {
    expect(laravelAuthApi.consumeOauthToken().ok).toBe(false);
  });
});
