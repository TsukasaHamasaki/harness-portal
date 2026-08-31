import test from "node:test";
import assert from "node:assert/strict";
import { describeAgentFailure } from "./agent-failure.mjs";

test("describeAgentFailure: 未ログインは /login への案内になる", () => {
  const sdkError = new Error("Claude Code returned an error result: Failed to authenticate: OAuth session expired and could not be refreshed");
  assert.match(describeAgentFailure(sdkError), /ログインしていません.*\/login/);
  assert.match(describeAgentFailure(new Error("Invalid API key · Please run /login")), /ログインしていません/);
});

test("describeAgentFailure: タイムアウト・SDK欠落・その他を区別し、その他はマスクして短く出す", () => {
  const timeout = new Error("x"); timeout.name = "TimeoutError";
  assert.match(describeAgentFailure(timeout), /タイムアウト/);
  assert.match(describeAgentFailure(new Error("Cannot find package '@anthropic-ai/claude-agent-sdk'")), /Agent SDK/);
  const other = describeAgentFailure(new Error("boom at /Users/someone/x " + "a".repeat(400)));
  assert.match(other, /問い合わせに失敗/);
  assert.equal(other.includes("/Users/someone"), false);
  assert.ok(other.length < 260);
});
