import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../../../shared/categories.mjs";
import { buildCapabilityMap, resolveStepTools } from "./capabilities";
import type { CapabilityItem } from "./capabilities";
import type { HarnessSnapshot } from "./schema";

function snapshot(): HarnessSnapshot {
  return {
    schemaVersion: 2,
    exportedAt: "2026-08-15T01:23:45.000Z",
    exporter: { kind: "cli", version: "1.0.0", classifier: "agent" },
    environment: { os: "darwin", claudeVersion: null, model: null, language: null },
    counts: { skills: 3, agents: 0, mcpServers: 0, plugins: 0, commands: 0 },
    skills: [
      { id: "agent-classified", name: "agent-classified", description: "説明。", scope: "user", triggers: [], category: "docs" },
      { id: "rule-classified", name: "browser automation", description: "browser を操作する。", scope: "user", triggers: [], category: null },
      { id: "unknown-skill", name: "zzzz-unknown", description: "分類不能な説明。", scope: "user", triggers: [], category: null },
    ],
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
  };
}

describe("buildCapabilityMap", () => {
  it("returns all categories and honors agent, rule, fallback priority", () => {
    const categories = buildCapabilityMap(snapshot());
    expect(categories).toHaveLength(14);
    expect(categories.map(({ id }) => id)).toEqual(CATEGORIES.map(({ id }) => id));

    const items = categories.flatMap((category) => category.items);
    expect(items.find((item) => item.id === "skill:agent-classified")).toMatchObject({ categoryId: "docs", source: "agent" });
    expect(items.find((item) => item.id === "skill:rule-classified")).toMatchObject({ source: "rule" });
    expect(items.find((item) => item.id === "skill:unknown-skill")).toMatchObject({ categoryId: "other", source: "fallback" });
    expect(categories.find((category) => category.id === "other")).toBeDefined();
  });
});

describe("重複するMCPサーバーの統合", () => {
  function withDuplicateMcp(): HarnessSnapshot {
    const s = snapshot();
    const server = {
      scope: "project" as const,
      transport: "stdio" as const,
      status: "connected" as const,
      category: "browser" as const,
    };
    s.mcpServers = [
      { id: "playwright", ...server },
      { id: "playwright", ...server },
      { id: "playwright", ...server },
      { id: "notion", ...server, category: "notion" as const },
    ];
    return s;
  }

  it("同一idのMCPサーバーを1件にまとめ、登場回数をoccurrencesに残す", () => {
    const items = buildCapabilityMap(withDuplicateMcp()).flatMap((c) => c.items);
    const playwright = items.filter((i) => i.id === "mcp:playwright");
    expect(playwright).toHaveLength(1);
    expect(playwright[0].occurrences).toBe(3);
  });

  it("重複していない項目のoccurrencesは1", () => {
    const items = buildCapabilityMap(withDuplicateMcp()).flatMap((c) => c.items);
    expect(items.find((i) => i.id === "mcp:notion")?.occurrences).toBe(1);
    expect(items.every((i) => i.occurrences >= 1)).toBe(true);
  });

  it("統合後の総数が重複分だけ減る", () => {
    const items = buildCapabilityMap(withDuplicateMcp()).flatMap((c) => c.items);
    expect(items).toHaveLength(3 + 2);
  });
});

describe("resolveStepTools", () => {
  function item(id: string): CapabilityItem {
    return {
      id,
      kind: "skill",
      title: id,
      summary: "",
      emoji: "🧩",
      categoryId: "other",
      source: "fallback",
      triggers: [],
      detail: "",
      occurrences: 1,
    };
  }

  it("resolveStepTools が itemIds の順序を保って解決する", () => {
    const map = new Map<string, CapabilityItem>([
      ["a", item("a")],
      ["b", item("b")],
      ["c", item("c")],
    ]);
    const result = resolveStepTools(["c", "a", "b"], map);
    expect(result.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("resolveStepTools は未解決 id を落とし、有効な分だけ返す", () => {
    const map = new Map<string, CapabilityItem>([
      ["a", item("a")],
      ["c", item("c")],
    ]);
    const result = resolveStepTools(["a", "b", "c"], map);
    expect(result.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("resolveStepTools は全 id 未解決なら空配列を返す", () => {
    const map = new Map<string, CapabilityItem>([["a", item("a")]]);
    const result = resolveStepTools(["x", "y"], map);
    expect(result).toEqual([]);
  });
});
