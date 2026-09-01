import test from "node:test";
import assert from "node:assert/strict";
import { cliText, detectLang, normalizeLang } from "./i18n.mjs";
import { categoryLabel } from "./categories.mjs";

test("normalizeLang: ja/en 系だけを正規化し、それ以外は null", () => {
  assert.equal(normalizeLang("ja"), "ja");
  assert.equal(normalizeLang("ja_JP.UTF-8"), "ja");
  assert.equal(normalizeLang("en-US"), "en");
  assert.equal(normalizeLang("fr_FR"), null);
  assert.equal(normalizeLang(undefined), null);
});

test("detectLang: 環境変数 > Intl ロケール。日本語以外は en", () => {
  assert.equal(detectLang({ env: { LANG: "ja_JP.UTF-8" } }), "ja");
  assert.equal(detectLang({ env: { LC_ALL: "en_US.UTF-8", LANG: "ja_JP.UTF-8" } }), "en");
  assert.equal(detectLang({ env: { LANG: "de_DE.UTF-8" } }), "en");
  assert.equal(detectLang({ env: {}, intlLocale: "ja-JP" }), "ja");
  assert.equal(detectLang({ env: {}, intlLocale: "en-GB" }), "en");
  assert.equal(detectLang({ env: { LANG: "C" }, intlLocale: "ja-JP" }), "ja");
});

test("cliText: 言語ごとの文言を返し、未対応言語は日本語に倒す", () => {
  assert.match(cliText("ja", "recipesDone", 10), /フロー生成完了 10件/);
  assert.match(cliText("en", "recipesDone", 10), /Generated 10 flows/);
  assert.match(cliText("en", "agentNotLoggedIn"), /not logged in/);
  assert.match(cliText("xx", "saveSkipped"), /保存 スキップ/);
  assert.throws(() => cliText("ja", "nope"), /unknown cli message/);
});

test("categoryLabel: 言語に応じたカテゴリ名", () => {
  assert.equal(categoryLabel("browser", "ja"), "ブラウザを操作する");
  assert.equal(categoryLabel("browser", "en"), "Browser automation");
  assert.equal(categoryLabel("other", "en"), "Other");
  assert.equal(categoryLabel("nope", "en"), "nope");
});
