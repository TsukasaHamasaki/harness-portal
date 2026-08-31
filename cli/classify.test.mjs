import test from "node:test";
import assert from "node:assert/strict";

import { classifyItems } from "./classify.mjs";

function makeItems(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: "skill:item-" + index,
    kind: "skill",
    name: index === 0 ? "browser-helper" : "unique-item-" + index,
    description: index === 0 ? "Chrome automation" : "A unique private capability",
  }));
}

test("classifyItems sends 60 items in 25, 25, and 10 batches and merges responses", async () => {
  const items = makeItems(60);
  const batches = [];
  const result = await classifyItems(items, {
    queryImpl: async ({ items: batch }) => {
      batches.push(batch.length);
      return JSON.stringify(Object.fromEntries(batch.map((item) => [item.id, "dev"])));
    },
  });
  assert.deepEqual(batches, [25, 25, 10]);
  assert.equal(result.mode, "agent");
  assert.equal(result.categories.size, 60);
  assert.equal(result.categories.get("skill:item-59"), "dev");
});

test("invalid and missing agent categories fall back per item", async () => {
  const result = await classifyItems([
    { id: "skill:browser", kind: "skill", name: "browser-tool", description: "Chrome automation" },
    { id: "skill:unknown", kind: "skill", name: "private", description: "no matching rule" },
  ], {
    queryImpl: async () => JSON.stringify({ "skill:browser": "not-a-category" }),
  });
  assert.equal(result.mode, "agent");
  assert.equal(result.categories.get("skill:browser"), "browser");
  assert.equal(result.categories.get("skill:unknown"), null);
});

test("query exceptions do not escape and produce complete rule fallback", async () => {
  const result = await classifyItems(makeItems(3), {
    queryImpl: async () => { throw new Error("authentication failed"); },
  });
  assert.equal(result.mode, "rule");
  assert.equal(result.categories.size, 3);
  assert.ok(result.warnings.length >= 1);
  assert.equal(result.categories.get("skill:item-0"), "browser");
});

test("API key is removed before an injected query implementation is reached", async () => {
  process.env.ANTHROPIC_API_KEY = "must-be-deleted";
  let observed;
  const result = await classifyItems([
    { id: "skill:one", kind: "skill", name: "one", description: "unique" },
  ], {
    queryImpl: async () => {
      observed = process.env.ANTHROPIC_API_KEY;
      return JSON.stringify({ "skill:one": "other" });
    },
  });
  assert.equal(observed, undefined);
  assert.equal(result.categories.get("skill:one"), "other");
});

test("async SDK responses use the successful ResultMessage result once", async () => {
  const result = await classifyItems([
    { id: "skill:one", kind: "skill", name: "one", description: "unique" },
    { id: "skill:two", kind: "skill", name: "two", description: "unique" },
  ], {
    queryImpl: async function* ({ items: batch }) {
      yield {
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: JSON.stringify({ [batch[0].id]: "dev" }) }] },
      };
      yield {
        type: "result",
        subtype: "success",
        result: JSON.stringify(Object.fromEntries(batch.map((item) => [item.id, "docs"]))),
      };
    },
  });
  assert.equal(result.mode, "agent");
  assert.equal(result.categories.get("skill:one"), "docs");
  assert.equal(result.categories.get("skill:two"), "docs");
});

test("classification timeout falls back without throwing", async () => {
  const result = await classifyItems([
    { id: "skill:browser", kind: "skill", name: "browser-tool", description: "Chrome automation" },
  ], {
    timeoutMs: 10,
    queryImpl: () => new Promise(() => undefined),
  });
  assert.equal(result.mode, "rule");
  assert.equal(result.categories.get("skill:browser"), "browser");
  assert.match(result.warnings[0], /timed out/);
});

test("no-agent mode does not import or call the SDK", async () => {
  let called = false;
  const result = await classifyItems(makeItems(1), {
    noAgent: true,
    queryImpl: async () => {
      called = true;
      return "{}";
    },
  });
  assert.equal(called, false);
  assert.equal(result.mode, "rule");
});
