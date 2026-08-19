import { describe, it, expect, vi } from "vitest";

vi.mock("laravel-echo", () => ({ default: vi.fn() }));
vi.mock("pusher-js", () => ({ default: vi.fn() }));

import { laravelRealtime } from "../realtime";

describe("laravelRealtime", () => {
  it("channel() returns a chainable object where on() returns itself", () => {
    const ch = laravelRealtime.channel("test-channel");
    const result = ch.on("postgres_changes", { event: "*" }, () => {});
    expect(result).toBe(ch);
  });

  it("subscribe() reports CHANNEL_ERROR when Echo cannot connect", async () => {
    const ch = laravelRealtime.channel("test-channel");
    const cb = vi.fn();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await ch.subscribe(cb);
    expect(cb).toHaveBeenCalledWith("CHANNEL_ERROR");
    errSpy.mockRestore();
  });

  it("unsubscribe() resolves quietly when never subscribed", async () => {
    const ch = laravelRealtime.channel("test-channel");
    await expect(ch.unsubscribe()).resolves.toBeUndefined();
  });

  it("removeChannel() does not throw", () => {
    const ch = laravelRealtime.channel("test-channel");
    expect(() => laravelRealtime.removeChannel(ch)).not.toThrow();
  });
});
