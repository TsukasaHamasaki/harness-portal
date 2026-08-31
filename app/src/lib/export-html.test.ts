import { describe, expect, it } from "vitest";
import { buildStandaloneHtml } from "./export-html";
import { SCHEMA_VERSION, type HarnessSnapshot } from "./schema";

function makeSnapshot(overrides: Partial<HarnessSnapshot> = {}): HarnessSnapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: "2026-08-19T01:23:45.000Z",
    exporter: { kind: "cli", version: "1.0.0", classifier: "rule" },
    environment: { os: "darwin", claudeVersion: null, model: null, language: "ja" },
    counts: { skills: 1, agents: 0, mcpServers: 0, plugins: 0, commands: 0 },
    skills: [
      {
        id: "skill-a",
        name: "<script>alert(1)</script>",
        description: "危険な名前のスキル。",
        scope: "user",
        triggers: [],
        category: "docs",
      },
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
    ...overrides,
  };
}

function assertNoExternalReferences(html: string) {
  expect(html).not.toMatch(/https?:\/\//);
  expect(html).not.toMatch(/(?:src|href)\s*=\s*["']\/\//);
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<link");
  expect(html).not.toContain("@import");
}

describe("buildStandaloneHtml", () => {
  it("returns a self-contained HTML document for view: map with no external references", () => {
    const html = buildStandaloneHtml({ title: "マップ", view: "map", snapshot: makeSnapshot() });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html.trim().endsWith("</html>")).toBe(true);
    assertNoExternalReferences(html);
  });

  it("returns a self-contained HTML document for view: flow with no external references", () => {
    const snapshot = makeSnapshot({
      recipes: [
        {
          id: "lp-production",
          title: "LP作成",
          summary: "企画から公開まで",
          steps: [
            { phase: "ディレクション", itemIds: ["skill:skill-a"] },
            { phase: "画像生成", itemIds: ["skill:nonexistent"] },
            { phase: "ナレーション", itemIds: [] },
          ],
        },
      ],
    });
    const html = buildStandaloneHtml({ title: "フロー", view: "flow", snapshot });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html.trim().endsWith("</html>")).toBe(true);
    assertNoExternalReferences(html);
  });

  it("does not throw and includes empty-state text when recipes is empty", () => {
    const snapshot = makeSnapshot({ recipes: [] });
    expect(() => buildStandaloneHtml({ title: "フロー", view: "flow", snapshot })).not.toThrow();
    const html = buildStandaloneHtml({ title: "フロー", view: "flow", snapshot });
    expect(html).toContain("npx harness-portal");
  });

  it("renders steps with no resolved items as 手段なし without dropping the step", () => {
    const snapshot = makeSnapshot({
      recipes: [
        {
          id: "empty-step",
          title: "テスト",
          summary: "",
          steps: [
            { phase: "存在しない工程", itemIds: ["skill:nonexistent"] },
            { phase: "空の工程", itemIds: [] },
            { phase: "解決できる工程", itemIds: ["skill:skill-a"] },
          ],
        },
      ],
    });
    const html = buildStandaloneHtml({ title: "フロー", view: "flow", snapshot });
    expect(html).toContain("手段なし");
    expect(html).toContain("存在しない工程");
    expect(html).toContain("空の工程");
  });

  it("escapes item names containing HTML special characters", () => {
    const html = buildStandaloneHtml({ title: "マップ", view: "map", snapshot: makeSnapshot() });
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("has no external references even when an item summary contains a URL", () => {
    const snapshot = makeSnapshot({
      skills: [
        {
          id: "skill-a",
          name: "URL入りスキル",
          description: "See https://example.com for docs.",
          scope: "user",
          triggers: [],
          category: "docs",
        },
      ],
      recipes: [
        {
          id: "lp-production",
          title: "LP作成",
          summary: "企画から公開まで",
          steps: [{ phase: "ディレクション", itemIds: ["skill:skill-a"] }],
        },
      ],
    });
    const mapHtml = buildStandaloneHtml({ title: "マップ", view: "map", snapshot });
    assertNoExternalReferences(mapHtml);
    const flowHtml = buildStandaloneHtml({ title: "フロー", view: "flow", snapshot });
    assertNoExternalReferences(flowHtml);
  });

  it("does not truncate item names", () => {
    const longName = "とても長い項目名".repeat(5);
    const snapshot = makeSnapshot({
      skills: [
        {
          id: "skill-long",
          name: longName,
          description: "長い名前のスキル。",
          scope: "user",
          triggers: [],
          category: "docs",
        },
      ],
    });
    const html = buildStandaloneHtml({ title: "マップ", view: "map", snapshot });
    expect(html).toContain(longName);
  });

  it("renders the flow view with one connector per gap between steps across all recipes", () => {
    const snapshot = makeSnapshot({
      recipes: [
        {
          id: "recipe-a",
          title: "レシピA",
          summary: "3工程",
          steps: [
            { phase: "工程1", itemIds: [] },
            { phase: "工程2", itemIds: [] },
            { phase: "工程3", itemIds: [] },
          ],
        },
        {
          id: "recipe-b",
          title: "レシピB",
          summary: "1工程",
          steps: [{ phase: "単独工程", itemIds: [] }],
        },
      ],
    });
    const html = buildStandaloneHtml({ title: "フロー", view: "flow", snapshot });
    const connectorCount = (html.match(/class="recipe-step-connector"/g) ?? []).length;
    // recipe-a: 3 steps -> 2 connectors, recipe-b: 1 step -> 0 connectors
    expect(connectorCount).toBe(2);
  });

  it("includes recipe-canvas and recipe-step-index in the flow view output", () => {
    const snapshot = makeSnapshot({
      recipes: [
        {
          id: "recipe-a",
          title: "レシピA",
          summary: "",
          steps: [{ phase: "工程1", itemIds: [] }],
        },
      ],
    });
    const html = buildStandaloneHtml({ title: "フロー", view: "flow", snapshot });
    expect(html).toContain('class="recipe-canvas"');
    expect(html).toContain('class="recipe-step-index"');
  });

  it("includes every recipe title and every step phase in the flow view output, with no <script", () => {
    const snapshot = makeSnapshot({
      recipes: [
        {
          id: "recipe-a",
          title: "レシピA",
          summary: "3工程",
          steps: [
            { phase: "工程1", itemIds: [] },
            { phase: "工程2", itemIds: [] },
            { phase: "工程3", itemIds: [] },
          ],
        },
        {
          id: "recipe-b",
          title: "レシピB",
          summary: "1工程",
          steps: [{ phase: "単独工程", itemIds: [] }],
        },
      ],
    });
    const html = buildStandaloneHtml({ title: "フロー", view: "flow", snapshot });
    expect(html).toContain("レシピA");
    expect(html).toContain("レシピB");
    expect(html).toContain("工程1");
    expect(html).toContain("工程2");
    expect(html).toContain("工程3");
    expect(html).toContain("単独工程");
    expect(html).not.toContain("<script");
  });
});
