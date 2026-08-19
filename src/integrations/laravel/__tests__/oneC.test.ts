import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { oneC } from "../oneC";

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

describe("oneC api", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it("listConnections() GETs the connections endpoint", async () => {
    mockJson({ data: [] });
    await oneC.listConnections();
    expect(String(lastCall()[0])).toContain("/integrations/1c/connections");
  });

  it("testConnection() posts to test endpoint", async () => {
    mockJson({ ok: true, message: "ok" });
    await oneC.testConnection("c1");
    const [url, init] = lastCall();
    expect(String(url)).toContain("/integrations/1c/connections/c1/test");
    expect(init.method).toBe("POST");
  });

  it("listMappings() includes entity in query", async () => {
    mockJson({ data: [] });
    await oneC.listMappings("employee");
    expect(String(lastCall()[0])).toContain("/integrations/1c/mappings?entity=employee");
  });

  it("saveMappings() normalises mapping payload and connection_id", async () => {
    mockJson({ ok: true, count: 1 });
    await oneC.saveMappings("employee", [{ entity: "employee", source_field: "a", target_field: "b", transform: undefined }], "conn1");
    const [, init] = lastCall();
    expect(JSON.parse(init.body)).toEqual({
      entity: "employee",
      connection_id: "conn1",
      mappings: [{ source_field: "a", target_field: "b", transform: null }],
    });
  });

  it("preview() sends multipart FormData with file", async () => {
    mockJson({ ok: true, columns: [], total: 0, sample: [] });
    const file = new File(["a,b"], "data.csv");
    await oneC.preview(file);
    const [url, init] = lastCall();
    expect(String(url)).toContain("/integrations/1c/preview");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
  });

  it("importFile() sets dry_run flag as string and includes connection_id when given", async () => {
    mockJson({ ok: true });
    const file = new File(["a"], "f.csv");
    await oneC.importFile(file, "department", { dryRun: true, connectionId: "conn1" });
    const [, init] = lastCall();
    const fd = init.body as FormData;
    expect(fd.get("entity")).toBe("department");
    expect(fd.get("dry_run")).toBe("1");
    expect(fd.get("connection_id")).toBe("conn1");
  });

  it("pull() defaults top to 1000 and dry_run to false", async () => {
    mockJson({ ok: true });
    await oneC.pull("conn1", "position");
    const [, init] = lastCall();
    expect(JSON.parse(init.body)).toEqual({
      connection_id: "conn1",
      entity: "position",
      path: null,
      top: 1000,
      dry_run: false,
    });
  });

  it("runRecords() appends action filter only when provided", async () => {
    mockJson({ run: {}, data: [] });
    await oneC.runRecords("r1");
    expect(String(lastCall()[0])).toMatch(/\/integrations\/1c\/runs\/r1$/);

    mockJson({ run: {}, data: [] });
    await oneC.runRecords("r1", "failed");
    expect(String(lastCall()[0])).toContain("/integrations/1c/runs/r1?action=failed");
  });

  it("retryRun() posts to retry endpoint", async () => {
    mockJson({ ok: true });
    await oneC.retryRun("r1");
    const [url, init] = lastCall();
    expect(String(url)).toContain("/integrations/1c/runs/r1/retry");
    expect(init.method).toBe("POST");
  });
});
