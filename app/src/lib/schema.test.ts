import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSnapshot, SCHEMA_VERSION } from "./schema";

const validSnapshot = {
  schemaVersion: SCHEMA_VERSION,
  exportedAt: "2026-08-15T01:23:45.000Z",
  exporter: { kind: "cli", version: "1.0.0", classifier: "rule" },
  environment: { os: "darwin", claudeVersion: null, model: null, language: "ja" },
  counts: { skills: 1, agents: 1, mcpServers: 1, plugins: 1, commands: 1 },
  skills: [{ id: "skill-a", name: "skill-a", description: "説明。", scope: "user", triggers: [], category: "docs" }],
  agents: [{ id: "agent-a", description: "説明。", tools: [], model: null, category: null }],
  mcpServers: [{ id: "mcp-a", scope: "connector", transport: "sse", status: "connected", category: null }],
  plugins: [{ id: "plugin-a", marketplace: "market", version: "1", enabled: true, installedAt: "" }],
  commands: [{ id: "command-a", scope: "project" }],
  hooks: [{ event: "SessionStart", count: 1 }],
  permissions: { defaultMode: null, allowCount: 0, categories: {} },
  claudeMd: { sections: [] },
  settings: { model: null, effortLevel: null, envKeyNames: [] },
  warnings: [],
};

describe("parseSnapshot", () => {
  it("accepts the supplied sample fixture", () => {
    const fixture = JSON.parse(
      readFileSync(new URL("../../../fixtures/harness.sample.json", import.meta.url), "utf8"),
    );
    const result = parseSnapshot(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.schemaVersion).toBe(2);
  });

  it("discards unknown top-level and nested skill keys", () => {
    const fixture = JSON.parse(
      readFileSync(new URL("../../../fixtures/harness.sample.json", import.meta.url), "utf8"),
    );
    const result = parseSnapshot({
      ...fixture,
      unexpectedTopLevel: "discard me",
      skills: fixture.skills.map((skill: Record<string, unknown>, index: number) =>
        index === 0 ? { ...skill, unexpectedSkillKey: "discard me too" } : skill,
      ),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("unexpectedTopLevel" in result.data).toBe(false);
    expect("unexpectedSkillKey" in result.data.skills[0]).toBe(false);
  });

  it("migrates the legacy v1 shape", () => {
    const result = parseSnapshot({
      schemaVersion: 1,
      machine: { id: "mac", label: "Mac", os: "macos" },
      collectedAt: "2026-08-01T00:00:00.000Z",
      counts: { skills: 0, agents: 0, mcpServers: 0, plugins: 0 },
      skills: [],
      agents: [],
      mcpServers: [],
      plugins: [],
      hooks: [],
      permissions: { allowCount: 0, categories: {} },
      claudeMd: { sections: [] },
      settings: { model: "sonnet", envKeyNames: [] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.exportedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(result.data.environment).toEqual({ os: "macos", claudeVersion: null, model: "sonnet", language: null });
    expect(result.data.exporter).toEqual({ kind: "cli", version: "legacy", classifier: "none" });
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("accepts the supplied legacy fixture", () => {
    const fixture = JSON.parse(
      readFileSync(new URL("../../../fixtures/harness.v1.json", import.meta.url), "utf8"),
    );
    const result = parseSnapshot(fixture);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.schemaVersion).toBe(2);
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      expect(result.data.environment).toEqual({
        os: "macos",
        claudeVersion: null,
        model: "opus[1m]",
        language: null,
      });
      expect(result.data.exporter).toEqual({ kind: "cli", version: "legacy", classifier: "none" });
    }
  });

  it("rejects an empty object", () => {
    const result = parseSnapshot({});
    expect(result.ok).toBe(false);
  });

  it("converts an unknown category to null", () => {
    const result = parseSnapshot({
      ...validSnapshot,
      skills: [{ ...validSnapshot.skills[0], category: "not-a-category" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.skills[0].category).toBeNull();
  });

  it("parseSnapshot fills recipes with an empty array when absent", () => {
    const v2Result = parseSnapshot(validSnapshot);
    expect(v2Result.ok).toBe(true);
    if (v2Result.ok) expect(v2Result.data.recipes).toEqual([]);

    const v1Result = parseSnapshot({
      schemaVersion: 1,
      machine: { id: "mac", label: "Mac", os: "macos" },
      collectedAt: "2026-08-01T00:00:00.000Z",
      counts: { skills: 0, agents: 0, mcpServers: 0, plugins: 0 },
      skills: [],
      agents: [],
      mcpServers: [],
      plugins: [],
      hooks: [],
      permissions: { allowCount: 0, categories: {} },
      claudeMd: { sections: [] },
      settings: { model: "sonnet", envKeyNames: [] },
    });
    expect(v1Result.ok).toBe(true);
    if (v1Result.ok) expect(v1Result.data.recipes).toEqual([]);
  });

  it("parseSnapshot drops malformed recipe entries", () => {
    const result = parseSnapshot({
      ...validSnapshot,
      recipes: [
        { id: "lp-production", title: "LP作成", summary: "企画から公開まで", steps: [{ phase: "ディレクション", itemIds: ["skill:direction"] }] },
        { id: "", title: "空id", summary: "", steps: [] },
        { id: "no-title", title: "", summary: "", steps: [] },
        { id: "not-array-steps", title: "工程が配列でない", summary: "", steps: "invalid" },
        {
          id: "mixed-steps",
          title: "工程が一部壊れている",
          summary: "",
          steps: [
            { phase: "有効な工程", itemIds: ["a", 1, null] },
            { phase: "", itemIds: [] },
            "not-an-object",
            { phase: "itemIdsが配列でない", itemIds: "invalid" },
          ],
        },
        "not-an-object",
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recipes).toEqual([
      {
        id: "lp-production",
        title: "LP作成",
        summary: "企画から公開まで",
        steps: [{ phase: "ディレクション", itemIds: ["skill:direction"] }],
      },
      {
        id: "mixed-steps",
        title: "工程が一部壊れている",
        summary: "",
        steps: [
          { phase: "有効な工程", itemIds: ["a"] },
          { phase: "itemIdsが配列でない", itemIds: [] },
        ],
      },
    ]);
  });

  it("mcpServers の projectLabel を通し、文字列でなければ落とす", () => {
    const stringResult = parseSnapshot({
      ...validSnapshot,
      mcpServers: [{ ...validSnapshot.mcpServers[0], projectLabel: "private-project" }],
    });
    expect(stringResult.ok).toBe(true);
    if (stringResult.ok) {
      expect(stringResult.data.mcpServers[0].projectLabel).toBe("private-project");
    }

    const numberResult = parseSnapshot({
      ...validSnapshot,
      mcpServers: [{ ...validSnapshot.mcpServers[0], projectLabel: 123 }],
    });
    expect(numberResult.ok).toBe(true);
    if (numberResult.ok) {
      expect("projectLabel" in numberResult.data.mcpServers[0]).toBe(false);
    }

    const nullResult = parseSnapshot({
      ...validSnapshot,
      mcpServers: [{ ...validSnapshot.mcpServers[0], projectLabel: null }],
    });
    expect(nullResult.ok).toBe(true);
    if (nullResult.ok) {
      expect("projectLabel" in nullResult.data.mcpServers[0]).toBe(false);
    }
  });
});
