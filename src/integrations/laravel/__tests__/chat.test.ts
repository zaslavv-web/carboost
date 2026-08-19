import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { chatApi } from "../chat";

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

describe("chatApi", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it("list() calls GET /chats", async () => {
    mockJson({ data: [] });
    await chatApi.list();
    const [url, init] = lastCall();
    expect(String(url)).toContain("/chats");
    expect(init.method).toBe("GET");
  });

  it("contacts() appends encoded query only when provided", async () => {
    mockJson({ data: [] });
    await chatApi.contacts("");
    expect(String(lastCall()[0])).toMatch(/\/chats\/contacts$/);

    mockJson({ data: [] });
    await chatApi.contacts("a b");
    expect(String(lastCall()[0])).toContain("/chats/contacts?q=a%20b");
  });

  it("createDirect() posts type + peer_user_id", async () => {
    mockJson({ data: { id: "c1" } }, 201);
    await chatApi.createDirect("u-2");
    const [url, init] = lastCall();
    expect(String(url)).toContain("/chats");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ type: "direct", peer_user_id: "u-2" });
  });

  it("messages() appends before param when given", async () => {
    mockJson({ data: [] });
    await chatApi.messages("c1");
    expect(String(lastCall()[0])).toMatch(/\/chats\/c1\/messages$/);

    mockJson({ data: [] });
    await chatApi.messages("c1", "2024-01-01");
    expect(String(lastCall()[0])).toContain("/chats/c1/messages?before=2024-01-01");
  });

  it("messagesSince() appends after param", async () => {
    mockJson({ data: [] });
    await chatApi.messagesSince("c1", "2024-01-01T00:00:00Z");
    expect(String(lastCall()[0])).toContain("after=2024-01-01T00%3A00%3A00Z");
  });

  it("send() posts body and reply_to_id (null by default)", async () => {
    mockJson({ data: { id: "m1" } });
    await chatApi.send("c1", "hello");
    const [url, init] = lastCall();
    expect(String(url)).toContain("/chats/c1/messages");
    expect(JSON.parse(init.body)).toEqual({ body: "hello", reply_to_id: null });
  });

  it("markRead() sends PATCH", async () => {
    mockJson({ ok: true });
    await chatApi.markRead("c1");
    const [url, init] = lastCall();
    expect(String(url)).toContain("/chats/c1/read");
    expect(init.method).toBe("PATCH");
  });

  it("toggleReaction() posts emoji", async () => {
    mockJson({ toggled: "on" });
    await chatApi.toggleReaction("c1", "m1", "🔥");
    const [url, init] = lastCall();
    expect(String(url)).toContain("/chats/c1/messages/m1/reactions");
    expect(JSON.parse(init.body)).toEqual({ emoji: "🔥" });
  });

  it("propagates error on failed request", async () => {
    mockJson({ message: "Boom" }, 500);
    mockJson({ message: "Boom" }, 500);
    const res = await chatApi.list();
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe("Boom");
  });
});
