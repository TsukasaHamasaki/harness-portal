import { describe, expect, it, vi } from "vitest";
import { createLocalHistoryStore } from "./history";
import type { HarnessSnapshot } from "./schema";

const snapshot = {
  schemaVersion: 2,
  exportedAt: "2026-08-15T01:23:45.000Z",
  exporter: { kind: "cli", version: "1.0.0", classifier: "rule" },
  environment: { os: "darwin", claudeVersion: null, model: null, language: null },
  counts: { skills: 0, agents: 0, mcpServers: 0, plugins: 0, commands: 0 },
  skills: [],
  agents: [],
  mcpServers: [],
  plugins: [],
  commands: [],
  hooks: [],
  permissions: { defaultMode: null, allowCount: 0, categories: {} },
  recipes: [],
  claudeMd: { sections: [] },
  settings: { model: null, effortLevel: null, envKeyNames: [] },
  warnings: [],
} satisfies HarnessSnapshot;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("local history store", () => {
  it("lists, loads, and deletes snapshots through the Local API", async () => {
    const older = { ...snapshot, exportedAt: "2026-08-14T01:23:45.000Z" };
    const files = new Map([
      ["harness-current.json", snapshot],
      ["harness-older.json", older],
    ]);
    const requests: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (url === "/api/snapshots" && method === "GET") {
        return jsonResponse([...files].map(([id, value]) => ({ id, exportedAt: value.exportedAt, label: id })));
      }
      const match = url.match(/^\/api\/snapshots\/(.+)$/);
      const fileId = match ? decodeURIComponent(match[1]) : "";
      if (method === "GET" && files.has(fileId)) return jsonResponse(files.get(fileId));
      if (method === "DELETE" && files.has(fileId)) {
        files.delete(fileId);
        return new Response(null, { status: 204 });
      }
      return jsonResponse({ error: "not found" }, 404);
    });
    const store = createLocalHistoryStore({ fetchImpl });

    const listed = await store.listSnapshots();
    expect(store.kind).toBe("local");
    expect(listed.map((item) => item.label)).toEqual(["harness-current.json", "harness-older.json"]);
    expect(await store.loadSnapshot("harness-older.json")).toEqual(older);

    await store.deleteSnapshot("harness-older.json");
    expect(requests.at(-1)).toEqual({ url: "/api/snapshots/harness-older.json", method: "DELETE" });
    expect((await store.listSnapshots()).map((item) => item.fileId)).toEqual(["harness-current.json"]);
  });

  it("propagates Local API deletion failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ error: "failed" }, 500));
    const store = createLocalHistoryStore({ fetchImpl });

    await expect(store.deleteSnapshot("harness-missing.json")).rejects.toThrow("HTTP 500");
  });
});
