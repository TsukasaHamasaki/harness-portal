import { describe, expect, it } from "vitest";
import { KIND_COLORS, KIND_LABELS_JA } from "./kind-colors";

describe("kind colors and labels", () => {
  it("defines the exact five kind colors", () => {
    expect(KIND_COLORS).toEqual({
      skill: "#0072B2",
      mcp: "#D55E00",
      agent: "#009E73",
      plugin: "#CC79A7",
      command: "#E69F00",
    });
  });

  it("defines the exact Japanese labels", () => {
    expect(KIND_LABELS_JA).toEqual({
      skill: "スキル",
      mcp: "MCP",
      agent: "エージェント",
      plugin: "プラグイン",
      command: "コマンド",
    });
  });
});
