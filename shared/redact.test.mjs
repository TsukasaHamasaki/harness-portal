import test from "node:test";
import assert from "node:assert/strict";

import { findSecretLike, maskDeep, maskString } from "./redact.mjs";

test("maskString: メールアドレスを[email]に置換する", () => {
  assert.equal(maskString("連絡先は user@example.com です"), "連絡先は [email] です");
});

test("maskString: sk- トークンを[redacted]に置換する", () => {
  assert.equal(maskString("key=sk-abcdefghijklmnopqrstuvwxyz123456"), "key=[redacted]");
});

test("maskString: ghp_ トークンを[redacted]に置換する", () => {
  assert.equal(maskString("token: ghp_EXAMPLE_NOT_A_REAL_TOKEN"), "token: [redacted]");
});

test("maskString: ghs_ トークンを[redacted]に置換する", () => {
  assert.equal(maskString("token: ghs_EXAMPLE_NOT_A_REAL_TOKEN"), "token: [redacted]");
});

test("maskString: xox (Slack) トークンを[redacted]に置換する", () => {
  assert.equal(maskString("slack token xoxb-EXAMPLE-NOT-A-REAL-TOKEN"), "slack token [redacted]");
});

test("maskString: AIza (Google APIキー) を[redacted]に置換する", () => {
  assert.equal(maskString("apiKey=AIzaEXAMPLE_NOT_A_REAL_KEY"), "apiKey=[redacted]");
});

test("maskString: 'Bearer ' に続くトークンを、Bearerごと[redacted]に置換する", () => {
  assert.equal(maskString("Authorization: Bearer abc123.def456-ghi789"), "Authorization: [redacted]");
  assert.ok(!maskString("Authorization: Bearer abc123.def456-ghi789").includes("Bearer"));
});

test("maskString: 40桁hexを[redacted]に置換する", () => {
  assert.equal(maskString(`sha=${"a".repeat(40)}`), "sha=[redacted]");
});

test("maskString: 64文字以上のbase64様文字列を[redacted]に置換する", () => {
  assert.equal(maskString(`jwt=${"A".repeat(70)}`), "jwt=[redacted]");
});

test("maskString: IPv4アドレスを[redacted]に置換する", () => {
  assert.equal(maskString("host=192.0.2.1 に接続"), "host=[redacted] に接続");
});

test("maskString: 9桁連続数字を[redacted]に置換する", () => {
  assert.equal(maskString("code=123456789 です"), "code=[redacted] です");
});

test("maskString: 8桁連続数字は9桁ルールの非マスク境界", () => {
  assert.equal(maskString("id=12345678"), "id=12345678");
});

test("maskString: 10桁連続数字は9桁ルールの非マスク境界", () => {
  assert.equal(maskString("id=1234567890"), "id=1234567890");
});

test("maskString: 汎用ホームパス /Users/anyone/x を ~/x に置換する", () => {
  assert.equal(maskString("/Users/anyone/x"), "~/x");
});

test("maskString: 汎用ホームパス /home/anyone/x を ~/x に置換する", () => {
  assert.equal(maskString("/home/anyone/x"), "~/x");
});

test("maskString: 汎用Windowsホームパスを ~ に置換する", () => {
  assert.equal(maskString(String.raw`C:\Users\anyone\x`), String.raw`~\x`);
});

test("maskDeep recurses through arrays and objects", () => {
  const output = maskDeep({
    a: "user@example.com",
    b: ["Bearer sk-abcdefghijklmnopqrstuvwxyz123456", { c: "/Users/anyone/x" }],
    d: 123,
    e: null,
  });
  assert.deepEqual(output, { a: "[email]", b: ["[redacted]", { c: "~/x" }], d: 123, e: null });
});

test("findSecretLike reports residual suspicious values by JSON path", () => {
  assert.deepEqual(findSecretLike({ safe: "[email]", nested: ["sk-abc123456", "ok"] }), ["$.nested[0]"]);
  assert.deepEqual(findSecretLike(maskDeep({ email: "a@example.com", path: "/home/a/file" })), []);
});
