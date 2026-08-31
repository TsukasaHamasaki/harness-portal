import test from "node:test";
import assert from "node:assert/strict";

import { CATEGORIES, CATEGORY_IDS, classifyByRule, isCategoryId } from "./categories.mjs";

test("categories expose the contract's fourteen ordered ids", () => {
  assert.equal(CATEGORIES.length, 14);
  assert.deepEqual(CATEGORY_IDS, CATEGORIES.map((category) => category.id));
  assert.equal(new Set(CATEGORY_IDS).size, 14);
  for (const id of CATEGORY_IDS) assert.equal(isCategoryId(id), true);
  assert.equal(isCategoryId("unknown"), false);
});

test("rule classification covers Japanese and English keywords", () => {
  assert.equal(classifyByRule("browser-helper", "automates Chrome"), "browser");
  assert.equal(classifyByRule("slide-maker", "PowerPoint presentation"), "docs");
  assert.equal(classifyByRule("動画編集", "video and image tooling"), "media");
  assert.equal(classifyByRule("voice-transcript", "文字起こし"), "transcribe");
  assert.equal(classifyByRule("ブログ執筆", "writing articles"), "writing");
  assert.equal(classifyByRule("rakuten-rms", "楽天の商品登録"), "ec");
  assert.equal(classifyByRule("gmail", "Google Workspace"), "gws");
  assert.equal(classifyByRule("notion", "task management"), "notion");
  assert.equal(classifyByRule("site-deploy", "publish a website with Vercel"), "web");
  assert.equal(classifyByRule("web-research", "調べもの"), "research");
  assert.equal(classifyByRule("sdk-agent", "開発用のAPI"), "dev");
  assert.equal(classifyByRule("sales-data", "データ分析"), "data");
  assert.equal(classifyByRule("slack", "communication"), "comm");
  assert.equal(classifyByRule("my-private-thing", "does a unique thing"), null);
});

test("English keywords use word boundaries for short category ids", () => {
  assert.equal(classifyByRule("project-helper", "private workflow"), null);
  assert.equal(classifyByRule("connector-tool", "private workflow"), null);
  assert.equal(classifyByRule("spec-review", "private workflow"), null);
  assert.equal(classifyByRule("rakuten-rms", "catalog tooling"), "ec");
  assert.equal(classifyByRule("api-client", "developer tooling"), "dev");
  assert.equal(classifyByRule("project-management", "task management"), "notion");
});
