import test from "node:test";
import assert from "node:assert/strict";

import { buildRecipes } from "./recipes.mjs";

function makeItems(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: "skill:item-" + index,
    kind: "skill",
    title: "Item " + index,
    summary: "A unique capability",
    categoryId: null,
  }));
}

test("hallucinated-item-ids-are-dropped", async () => {
  const items = makeItems(2);
  const result = await buildRecipes(items, {
    queryImpl: async () => JSON.stringify({
      recipes: [
        {
          id: "lp-production",
          title: "LP作成",
          summary: "企画から公開まで",
          steps: [
            { phase: "ディレクション", itemIds: ["skill:item-0", "skill:does-not-exist"] },
            { phase: "画像生成", itemIds: ["skill:also-fake"] },
            { phase: "ナレーション", itemIds: ["skill:item-1"] },
          ],
        },
      ],
    }),
  });
  assert.equal(result.recipes.length, 1);
  const [recipe] = result.recipes;
  assert.deepEqual(recipe.steps[0].itemIds, ["skill:item-0"]);
  // hallucinated-only step is dropped down to an empty array, not removed as a step ("手段なし")
  assert.deepEqual(recipe.steps[1].itemIds, []);
  assert.equal(recipe.steps.length, 3);
});

test("agent-failure-returns-empty-recipes", async () => {
  const result = await buildRecipes(makeItems(3), {
    queryImpl: async () => { throw new Error("authentication failed"); },
  });
  assert.deepEqual(result.recipes, []);
  assert.ok(result.warnings.length >= 1);
});

test("clamps-recipe-and-step-counts", async () => {
  const items = makeItems(1);
  const knownId = items[0].id;

  function stepsOf(count) {
    return Array.from({ length: count }, (_, index) => ({
      phase: "phase-" + index,
      itemIds: [knownId],
    }));
  }

  const rawRecipes = Array.from({ length: 12 }, (_, index) => {
    const n = index + 1;
    return {
      id: "r" + n,
      title: "Recipe " + n,
      summary: "summary " + n,
      // recipe #2 has too few steps and must be dropped entirely (below MIN_STEPS after clamping)
      steps: n === 2 ? stepsOf(2) : stepsOf(9),
    };
  });

  const result = await buildRecipes(items, {
    queryImpl: async () => JSON.stringify({ recipes: rawRecipes }),
  });

  assert.equal(result.recipes.length, 10);
  for (const recipe of result.recipes) {
    assert.equal(recipe.steps.length, 7);
  }
  assert.ok(!result.recipes.some((recipe) => recipe.id === "r2"));
  assert.ok(!result.warnings.some((warning) => warning.includes("clamped")));
});

test("no-agent-skips-generation", async () => {
  let called = false;
  const result = await buildRecipes(makeItems(1), {
    noAgent: true,
    queryImpl: async () => {
      called = true;
      return "{}";
    },
  });
  assert.equal(called, false);
  assert.deepEqual(result.recipes, []);
  assert.deepEqual(result.warnings, ["recipes skipped (--no-agent)"]);
});
