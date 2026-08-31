/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RecipeFlow } from "./RecipeFlow";
import type { CapabilityItem } from "../lib/capabilities";
import type { Recipe } from "../lib/schema";

afterEach(() => cleanup());

function makeItem(overrides: Partial<CapabilityItem> & { id: string; title: string }): CapabilityItem {
  return {
    kind: "skill",
    summary: "",
    emoji: "🧩",
    categoryId: "other",
    source: "rule",
    triggers: [],
    detail: overrides.title,
    occurrences: 1,
    ...overrides,
  };
}

const longTitle = "非常に長い名前のスキルでも省略せずに全文表示されるべきテスト項目名";

const items: CapabilityItem[] = [
  makeItem({ id: "skill:direction", title: "direction", kind: "skill" }),
  makeItem({ id: "skill:image-maker", title: "image-maker", kind: "skill" }),
  makeItem({ id: "skill:long-name", title: longTitle, kind: "skill" }),
];

const recipes: Recipe[] = [
  {
    id: "lp-production",
    title: "LP作成",
    summary: "企画から公開まで",
    steps: [
      { phase: "ディレクション", itemIds: ["skill:direction"] },
      { phase: "画像生成", itemIds: ["skill:image-maker", "skill:does-not-exist"] },
      { phase: "ナレーション", itemIds: [] },
      { phase: "長い名前の確認", itemIds: ["skill:long-name"] },
    ],
  },
];

describe("RecipeFlow", () => {
  it("shows 手段なし for a step with no itemIds", () => {
    render(<RecipeFlow recipes={recipes} items={items} />);
    const steps = screen.getAllByText(/ディレクション|画像生成|ナレーション|長い名前の確認/);
    const narrationStep = steps.find((el) => el.textContent === "ナレーション")?.closest(".recipe-step");
    expect(narrationStep).toBeTruthy();
    expect(within(narrationStep as HTMLElement).getByText("手段なし")).toBeTruthy();
  });

  it("does not render an itemId that does not exist in items", () => {
    render(<RecipeFlow recipes={recipes} items={items} />);
    const imageStepPhase = screen.getByText("画像生成");
    const imageStep = imageStepPhase.closest(".recipe-step") as HTMLElement;
    const chips = within(imageStep).getAllByText("image-maker");
    expect(chips).toHaveLength(1);
    expect(within(imageStep).queryByText("does-not-exist")).toBeNull();
  });

  it("renders the chip label as the full, unshortened item title", () => {
    render(<RecipeFlow recipes={recipes} items={items} />);
    const label = screen.getByText(longTitle);
    expect(label.textContent).toBe(longTitle);
    expect(label.className).toBe("capability-chip-label");
  });

  it("shows 手段なし when all itemIds in a step fail to resolve", () => {
    const ghostRecipes: Recipe[] = [
      {
        id: "ghost-recipe",
        title: "存在しないツールのレシピ",
        summary: "全ID未解決",
        steps: [
          { phase: "幽霊工程", itemIds: ["skill:ghost-a", "skill:ghost-b"] },
        ],
      },
    ];
    render(<RecipeFlow recipes={ghostRecipes} items={items} />);
    const ghostStep = screen.getByText("幽霊工程").closest(".recipe-step") as HTMLElement;
    expect(within(ghostStep).getByText("手段なし")).toBeTruthy();
    expect(within(ghostStep).queryByText("ghost-a")).toBeNull();
  });

  it("shows the empty-state copy when recipes is an empty array", () => {
    render(<RecipeFlow recipes={[]} items={items} />);
    expect(
      screen.getByText("フローは npx harness-portal（--no-agent なし）で生成されます"),
    ).toBeTruthy();
    expect(screen.queryByText("LP作成")).toBeNull();
  });

  const threeStepRecipes: Recipe[] = [
    {
      id: "three-step",
      title: "三工程",
      summary: "連番確認",
      steps: [
        { phase: "工程A", itemIds: [] },
        { phase: "工程B", itemIds: [] },
        { phase: "工程C", itemIds: [] },
      ],
    },
  ];

  it("shows a 1-based sequence number on each step node", () => {
    render(<RecipeFlow recipes={threeStepRecipes} items={items} />);
    const indices = screen.getAllByTestId("recipe-step-index").map((el) => el.textContent);
    expect(indices).toEqual(["1", "2", "3"]);
  });

  it("工程3つのレシピでエッジが2本描画される", () => {
    render(<RecipeFlow recipes={threeStepRecipes} items={items} />);
    expect(screen.getAllByTestId("recipe-edge")).toHaveLength(2);
  });

  it("工程1つのレシピではエッジが0本", () => {
    const singleStepRecipes: Recipe[] = [
      {
        id: "single-step",
        title: "単一工程",
        summary: "1つだけ",
        steps: [{ phase: "唯一の工程", itemIds: [] }],
      },
    ];
    render(<RecipeFlow recipes={singleStepRecipes} items={items} />);
    expect(screen.queryAllByTestId("recipe-edge")).toHaveLength(0);
  });

  it("エッジのpathにmarker-end属性が付いている", () => {
    render(<RecipeFlow recipes={threeStepRecipes} items={items} />);
    const edges = screen.getAllByTestId("recipe-edge");
    for (const edge of edges) {
      expect(edge.getAttribute("marker-end")).toBe("url(#recipe-arrow-three-step)");
    }
  });

  it("エッジのd属性が M で始まり C を含む3次ベジェである", () => {
    render(<RecipeFlow recipes={threeStepRecipes} items={items} />);
    const edges = screen.getAllByTestId("recipe-edge");
    for (const edge of edges) {
      const d = edge.getAttribute("d") ?? "";
      expect(d.startsWith("M")).toBe(true);
      expect(d.includes("C")).toBe(true);
    }
  });

  it("未測定でも全エッジの d が空でなく M で始まる", () => {
    render(<RecipeFlow recipes={threeStepRecipes} items={items} />);
    const edges = screen.getAllByTestId("recipe-edge");
    for (const edge of edges) {
      const d = edge.getAttribute("d") ?? "";
      expect(d.length).toBeGreaterThan(0);
      expect(d.startsWith("M")).toBe(true);
    }
  });

  it("未測定時のエッジは laneY=null 相当で C を1つだけ持つ", () => {
    render(<RecipeFlow recipes={threeStepRecipes} items={items} />);
    const edges = screen.getAllByTestId("recipe-edge");
    for (const edge of edges) {
      const d = edge.getAttribute("d") ?? "";
      const count = (d.match(/C/g) ?? []).length;
      expect(count).toBe(1);
    }
  });

  it("レシピごとにskill化プロンプトのボタンが1つある", () => {
    const twoRecipes: Recipe[] = [...recipes, threeStepRecipes[0]];
    render(<RecipeFlow recipes={twoRecipes} items={items} />);
    expect(screen.getAllByTestId("recipe-skill-prompt")).toHaveLength(2);
  });

  it("clipboardが無い環境でもボタン押下で例外が出ない", () => {
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    render(<RecipeFlow recipes={threeStepRecipes} items={items} />);
    const button = screen.getByTestId("recipe-skill-prompt");
    expect(() => fireEvent.click(button)).not.toThrow();
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
  });
});
