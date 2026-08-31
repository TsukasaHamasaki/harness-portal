import { describe, expect, it } from "vitest";
import { diffSnapshots } from "./diff";
import type { HarnessSnapshot } from "./schema";

function snapshot(skills: HarnessSnapshot["skills"]): HarnessSnapshot {
  return {
    schemaVersion: 2,
    exportedAt: "2026-08-15T01:23:45.000Z",
    exporter: { kind: "cli", version: "1.0.0", classifier: "none" },
    environment: { os: "darwin", claudeVersion: null, model: null, language: null },
    counts: { skills: skills.length, agents: 0, mcpServers: 0, plugins: 0, commands: 0 },
    skills,
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

const skill = (id: string, description: string) => ({
  id,
  name: id,
  description,
  scope: "user" as const,
  triggers: [],
  category: null,
});

describe("diffSnapshots", () => {
  it("separates one added, removed, changed, and unchanged item", () => {
    const before = snapshot([
      skill("same", "変わらない。"),
      skill("changed", "変更前。"),
      skill("removed", "削除される。"),
    ]);
    const after = snapshot([
      skill("same", "変わらない。"),
      skill("changed", "変更後。"),
      skill("added", "追加される。"),
    ]);
    const result = diffSnapshots(before, after);
    expect(result.added.map((item) => item.id)).toEqual(["skill:added"]);
    expect(result.removed.map((item) => item.id)).toEqual(["skill:removed"]);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].fields).toEqual(["summary", "detail"]);
    expect(result.unchangedCount).toBe(1);
  });
});
