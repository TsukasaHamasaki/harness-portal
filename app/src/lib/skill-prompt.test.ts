import { describe, expect, it } from "vitest";
import { buildSkillPrompt, buildAllSkillPromptEntries } from "./skill-prompt";
import type { CapabilityItem } from "./capabilities";
import type { Recipe } from "./schema";

function item(overrides: Partial<CapabilityItem> & { id: string }): CapabilityItem {
  return {
    id: overrides.id,
    kind: overrides.kind ?? "skill",
    title: overrides.title ?? overrides.id,
    summary: overrides.summary ?? "説明。",
    emoji: overrides.emoji ?? "🧩",
    categoryId: overrides.categoryId ?? "other",
    source: overrides.source ?? "rule",
    triggers: overrides.triggers ?? [],
    detail: overrides.detail ?? "詳細。",
    occurrences: overrides.occurrences ?? 1,
  };
}

const items: CapabilityItem[] = [
  item({ id: "skill:a", kind: "skill", title: "スキルA", summary: "スキルAの説明。" }),
  item({ id: "mcp:b", kind: "mcp", title: "MCP-B", summary: "MCP-Bの説明。" }),
  item({ id: "skill:empty", kind: "skill", title: "スキル空", summary: "" }),
];

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "my-recipe",
    title: "サンプルレシピ",
    summary: "レシピの概要。",
    steps: [{ phase: "工程1", itemIds: ["skill:a"] }],
    ...overrides,
  };
}

describe("buildSkillPrompt", () => {
  it("出力の1行目が # スキル化依頼: <title> である", () => {
    const md = buildSkillPrompt({ recipe: recipe({ title: "タイトル例" }), items });
    expect(md.split("\n")[0]).toBe("# スキル化依頼: タイトル例");
  });

  it("固定見出し6つがこの順で出力に含まれる", () => {
    const md = buildSkillPrompt({ recipe: recipe(), items });
    const headings = ["## 目的", "## 工程と使うツール", "## 成果物", "## SKILL.md の要件", "## 補足"];
    const indices = headings.map((h) => md.indexOf(h));
    expect(md.indexOf("# スキル化依頼: サンプルレシピ")).toBe(0);
    for (const idx of indices) expect(idx).toBeGreaterThan(-1);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it("全工程の phase が出力に含まれる", () => {
    const r = recipe({
      steps: [
        { phase: "工程アルファ", itemIds: ["skill:a"] },
        { phase: "工程ベータ", itemIds: [] },
      ],
    });
    const md = buildSkillPrompt({ recipe: r, items });
    expect(md).toContain("工程アルファ");
    expect(md).toContain("工程ベータ");
  });

  it("割り当てられた全ツール名が出力に含まれる", () => {
    const r = recipe({ steps: [{ phase: "工程1", itemIds: ["skill:a", "mcp:b"] }] });
    const md = buildSkillPrompt({ recipe: r, items });
    expect(md).toContain("スキルA");
    expect(md).toContain("MCP-B");
  });

  it("1工程に複数ツールがあるとき、番号行は1つでバレットがツール数だけ並ぶ", () => {
    const r = recipe({ steps: [{ phase: "工程1", itemIds: ["skill:a", "mcp:b"] }] });
    const md = buildSkillPrompt({ recipe: r, items });
    const lines = md.split("\n");
    const numberedLineIndices = lines
      .map((line, idx) => ({ line, idx }))
      .filter(({ line }) => line.startsWith("1. **工程1**"));
    expect(numberedLineIndices).toHaveLength(1);
    const start = numberedLineIndices[0].idx;
    expect(lines[start + 1].startsWith("   - ")).toBe(true);
    expect(lines[start + 2].startsWith("   - ")).toBe(true);
    expect(lines[start + 3].startsWith("   - ")).toBe(false);
  });

  it("summary が空文字のツールは — を付けずに出力する", () => {
    const r = recipe({ steps: [{ phase: "工程1", itemIds: ["skill:empty"] }] });
    const md = buildSkillPrompt({ recipe: r, items });
    expect(md).toContain("   - `スキル空`（スキル）");
    expect(md).not.toMatch(/スキル空.*—/);
  });

  it("手段なしの工程に ⚠ 手段なし と代替検討の文言が出る", () => {
    const r = recipe({ steps: [{ phase: "工程1", itemIds: [] }] });
    const md = buildSkillPrompt({ recipe: r, items });
    expect(md).toContain("⚠ 手段なし");
    expect(md).toContain("代替案を提案するか、ユーザーに確認してください。");
  });

  it("items に無い itemId は出力に現れない", () => {
    const r = recipe({ steps: [{ phase: "工程1", itemIds: ["skill:a", "skill:not-found"] }] });
    const md = buildSkillPrompt({ recipe: r, items });
    expect(md).not.toContain("skill:not-found");
  });

  it("一部の itemId だけ未解決の工程は手段なしにならず、有効な分だけ列挙される", () => {
    const r = recipe({ steps: [{ phase: "工程1", itemIds: ["skill:a", "skill:not-found"] }] });
    const md = buildSkillPrompt({ recipe: r, items });
    expect(md).not.toContain("⚠ 手段なし");
    expect(md).toContain("スキルA");
  });

  it("成果物パスに recipe.id が入る", () => {
    const md = buildSkillPrompt({ recipe: recipe({ id: "my-cool-recipe" }), items });
    expect(md).toContain("`~/.claude/skills/my-cool-recipe/SKILL.md`");
  });

  it("戻り値が string であり Promise ではない", () => {
    const result = buildSkillPrompt({ recipe: recipe(), items });
    expect(typeof result).toBe("string");
    expect((result as unknown) instanceof Promise).toBe(false);
  });
});

describe("buildAllSkillPromptEntries", () => {
  it("buildAllSkillPromptEntries はレシピ数と同じ数のエントリを返す", () => {
    const recipes = [recipe({ id: "r1" }), recipe({ id: "r2" }), recipe({ id: "r3" })];
    const entries = buildAllSkillPromptEntries({ recipes, items });
    expect(entries).toHaveLength(3);
  });

  it("エントリ名が skill-prompt-<id>.md 形式になる", () => {
    const recipes = [recipe({ id: "my-cool-recipe" })];
    const entries = buildAllSkillPromptEntries({ recipes, items });
    expect(entries[0].name).toBe("skill-prompt-my-cool-recipe.md");
  });

  it("同じidのレシピがあってもファイル名が衝突しない", () => {
    const recipes = [recipe({ id: "dup" }), recipe({ id: "dup" }), recipe({ id: "dup" })];
    const entries = buildAllSkillPromptEntries({ recipes, items });
    const names = entries.map((e) => e.name);
    expect(new Set(names).size).toBe(3);
    expect(names).toEqual(["skill-prompt-dup.md", "skill-prompt-dup-2.md", "skill-prompt-dup-3.md"]);
  });

  it("ファイル名に使えない文字がハイフンに置換される", () => {
    const recipes = [recipe({ id: "a/b c!d" })];
    const entries = buildAllSkillPromptEntries({ recipes, items });
    expect(entries[0].name).toBe("skill-prompt-a-b-c-d.md");
  });

  it("各エントリの内容が buildSkillPrompt の出力と一致する", () => {
    const r = recipe({ id: "content-check" });
    const recipes = [r];
    const entries = buildAllSkillPromptEntries({ recipes, items });
    expect(entries[0].content).toBe(buildSkillPrompt({ recipe: r, items }));
  });

  it("recipes が空なら空配列を返す", () => {
    const entries = buildAllSkillPromptEntries({ recipes: [], items });
    expect(entries).toEqual([]);
  });

  it("サニタイズ後に同名へ収束する別idでもファイル名が衝突しない", () => {
    const recipes = [recipe({ id: "a/b" }), recipe({ id: "a b" })];
    const entries = buildAllSkillPromptEntries({ recipes, items });
    const names = entries.map((e) => e.name);
    expect(new Set(names).size).toBe(2);
  });

  it("idが空文字でもファイル名が生成される", () => {
    const recipes = [recipe({ id: "" })];
    const entries = buildAllSkillPromptEntries({ recipes, items });
    expect(entries[0].name).toBe("skill-prompt-recipe-1.md");
  });
});
