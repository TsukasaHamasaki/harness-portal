import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildMcpEntry,
  categorizePermission,
  collect,
  extractFrontmatter,
  extractTriggers,
  mcpListInvocation,
  resolveClaudeExecutable,
  parseMcpListOutput,
} from "./collect.mjs";
import { findSecretLike } from "../shared/redact.mjs";

test("collect keeps the reference frontmatter and helper behavior", () => {
  assert.equal(extractFrontmatter("---\nname: foo\ndescription: 単一行\n---\nbody").description, "単一行");
  assert.equal(
    extractFrontmatter("---\nname: foo\ndescription: >-\n  1行目\n  2行目\n---\nbody").description,
    "1行目 2行目",
  );
  assert.equal(
    extractFrontmatter('---\nname: foo\ndescription: "「trigger」を含む"\n---\n').description,
    "「trigger」を含む",
  );
  assert.deepEqual(extractFrontmatter("no frontmatter"), {});
  assert.deepEqual(extractTriggers("「one」「two」"), ["one", "two"]);
  assert.equal(categorizePermission("Bash(npm install:*)"), "bash");
  assert.equal(categorizePermission("mcp__notion__*"), "mcp");
  assert.equal(categorizePermission("WebFetch(domain:example.com)"), "other");
});

test("buildMcpEntry drops env, headers, and secret-like arguments", () => {
  const stdio = buildMcpEntry("local-notes", {
    command: "node",
    args: ["/Users/anyone/server.mjs"],
    env: { SUPABASE_SERVICE_ROLE_KEY: "secret" },
  }, "global");
  assert.deepEqual(stdio, {
    id: "local-notes",
    scope: "global",
    transport: "stdio",
    commandSummary: "node /Users/anyone/server.mjs",
    category: null,
  });
  assert.equal("env" in stdio, false);

  const http = buildMcpEntry("remote-http", {
    type: "http",
    url: "https://mcp.example.com/mcp",
    headers: { "X-Api-Key": "secret" },
  }, "global");
  assert.deepEqual(http, {
    id: "remote-http",
    scope: "global",
    transport: "http",
    host: "mcp.example.com",
    category: null,
  });

  const args = buildMcpEntry(
    "x",
    { command: "some-cli", args: ["--token", "supersecret", "serve", "--port", "1234"] },
    "global",
  );
  assert.equal(args.commandSummary, "some-cli serve --port");
});

test("buildMcpEntry removes every specified secret-like option form", () => {
  const cases = [
    [["--token", "supersecret", "serve"], "tool serve"],
    [["--access-token", "opaque123", "serve"], "tool serve"],
    [["--auth-token", "zzz999", "serve"], "tool serve"],
    [["--client-secret", "cs_abc", "serve"], "tool serve"],
    [["--api-key=AKIAsomething"], "tool"],
    [["--password-file", "/x/p.txt", "serve"], "tool serve"],
    [["--token", "-opaque123", "serve"], "tool serve"],
  ];

  for (const [args, expected] of cases) {
    assert.equal(buildMcpEntry("case", { command: "tool", args }, "global").commandSummary, expected);
  }
});

test("secret-like option matching includes credential, separators, and case variants", () => {
  for (const args of [
    ["--credential", "credential-value", "serve"],
    ["--client_secret", "underscore-value", "serve"],
    ["--AUTH-TOKEN", "uppercase-value", "serve"],
  ]) {
    assert.equal(buildMcpEntry("case", { command: "tool", args }, "global").commandSummary, "tool serve");
  }
});

test("MCP list command summaries also drop secret argument names and values", () => {
  const entries = parseMcpListOutput([
    "mcp-one: tool --client_secret credential-value serve - Connected",
    "mcp-two: tool --ACCESS-TOKEN opaque123 serve - Connected",
    "mcp-three: tool --token -opaque123 serve - Connected",
  ].join("\n"));
  assert.deepEqual(entries.map((entry) => entry.commandSummary), ["tool serve", "tool serve", "tool serve"]);
  const serialized = JSON.stringify(entries);
  for (const secret of ["--client_secret", "credential-value", "--ACCESS-TOKEN", "opaque123", "--token", "-opaque123"]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("collect uses only the allowlist, masks output, and never writes to the scan tree", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "harness-collect-"));
  const claudeDir = path.join(root, ".claude");
  await fs.promises.mkdir(path.join(claudeDir, "skills", "visible"), { recursive: true });
  await fs.promises.mkdir(path.join(claudeDir, "agents"), { recursive: true });
  await fs.promises.mkdir(path.join(claudeDir, "commands"), { recursive: true });
  await fs.promises.mkdir(path.join(claudeDir, "plugins"), { recursive: true });
  await fs.promises.writeFile(path.join(claudeDir, "skills", "visible", "SKILL.md"), [
    "---",
    "name: visible",
    "description: |-",
    "  video skill for user@example.com sk-abcdefghijklmnopqrstuvwxyz123456",
    "---",
    "body",
  ].join("\n"));
  await fs.promises.writeFile(path.join(claudeDir, "skills", "visible", "secret.txt"), "sk-should-not-be-read");
  await fs.promises.writeFile(
    path.join(claudeDir, "agents", "one.md"),
    "---\nname: one\ndescription: review\ntools: Read, Write\nmodel: sonnet\n---\n",
  );
  await fs.promises.writeFile(path.join(claudeDir, "commands", "hello.md"), "command");
  await fs.promises.writeFile(path.join(claudeDir, "settings.json"), JSON.stringify({
    model: "sonnet",
    effortLevel: "high",
    env: { API_KEY: "must-not-be-read" },
    permissions: { defaultMode: "acceptEdits", allow: ["Bash(npm:*)", "mcp__foo__*"] },
    hooks: { PreToolUse: [{ command: "echo" }] },
  }));
  await fs.promises.writeFile(path.join(claudeDir, "plugins", "installed_plugins.json"), JSON.stringify({
    plugins: { "demo@market": [{ version: "1.0.0", enabled: true, installedAt: "2026-08-15" }] },
  }));
  await fs.promises.writeFile(path.join(claudeDir, "CLAUDE.md"), "# Root\n## Safe section\n");
  await fs.promises.writeFile(path.join(root, ".claude.json"), JSON.stringify({
    mcpServers: {
      foo: { command: "node", args: ["server.js", "--token", "secret-value"], env: { TOKEN: "secret" } },
      connector: { type: "http", url: "https://connector.example/mcp", headers: { Authorization: "Bearer secret" } },
    },
  }));

  const reads = [];
  const writes = [];
  const originalReadFileSync = fs.readFileSync;
  const originalWriteFileSync = fs.writeFileSync;
  const originalAppendFileSync = fs.appendFileSync;
  fs.readFileSync = function (...args) {
    reads.push(path.resolve(String(args[0])));
    return originalReadFileSync.apply(this, args);
  };
  fs.writeFileSync = function (...args) {
    writes.push(path.resolve(String(args[0])));
    return originalWriteFileSync.apply(this, args);
  };
  fs.appendFileSync = function (...args) {
    writes.push(path.resolve(String(args[0])));
    return originalAppendFileSync.apply(this, args);
  };
  try {
    const snapshot = await collect({ claudeDir, homeDir: root, runMcpList: false });
    assert.equal(snapshot.schemaVersion, 2);
    assert.equal(snapshot.counts.skills, 1);
    assert.equal(snapshot.counts.commands, 1);
    assert.equal(snapshot.skills[0].category, null);
    assert.equal(snapshot.mcpServers[0].status, "unknown");
    assert.deepEqual(snapshot.settings.envKeyNames, ["API_KEY"]);
    assert.deepEqual(findSecretLike(snapshot), []);
    assert.equal(JSON.stringify(snapshot).includes("should-not-be-read"), false);
    assert.equal(reads.some((filePath) => filePath.endsWith("UNALLOWLISTED_SECRET.txt")), false);
    assert.equal(writes.filter((filePath) => filePath.startsWith(path.resolve(claudeDir) + path.sep)).length, 0);
  } finally {
    fs.readFileSync = originalReadFileSync;
    fs.writeFileSync = originalWriteFileSync;
    fs.appendFileSync = originalAppendFileSync;
  }
});

test("MCP list success merges connector status and failures fall back with a warning", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "harness-mcp-"));
  const claudeDir = path.join(root, ".claude");
  await fs.promises.mkdir(claudeDir, { recursive: true });
  await fs.promises.writeFile(path.join(root, ".claude.json"), JSON.stringify({
    mcpServers: { configured: { command: "node" } },
  }));

  const success = await collect({
    claudeDir,
    homeDir: root,
    mcpListImpl: async () => "claude.ai Gmail: https://gmail.example/mcp - ✓ Connected\nconfigured: node server - Failed",
  });
  const connector = success.mcpServers.find((server) => server.scope === "connector");
  assert.equal(connector?.status, "connected");
  assert.equal(success.mcpServers.find((server) => server.id === "configured")?.status, "failed");

  const fallback = await collect({
    claudeDir,
    homeDir: root,
    mcpListImpl: async () => { throw new Error("timed out"); },
  });
  assert.equal(fallback.mcpServers.length, 1);
  assert.equal(fallback.mcpServers[0].status, "unknown");
  assert.match(fallback.warnings[0], /fell back to \.claude\.json/);
});

test("MCP list timeout falls back after the configured deadline", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "harness-mcp-timeout-"));
  const claudeDir = path.join(root, ".claude");
  await fs.promises.mkdir(claudeDir, { recursive: true });
  await fs.promises.writeFile(path.join(root, ".claude.json"), JSON.stringify({
    mcpServers: { configured: { command: "node" } },
  }));
  const startedAt = Date.now();
  const snapshot = await collect({
    claudeDir,
    homeDir: root,
    mcpTimeoutMs: 20,
    mcpListImpl: () => new Promise(() => undefined),
  });
  const elapsedMs = Date.now() - startedAt;
  assert.equal(snapshot.mcpServers[0].status, "unknown");
  assert.match(snapshot.warnings[0], /timed out after 20 seconds/);
  assert.ok(elapsedMs >= 10);
});

test("parseMcpListOutput recognizes connected remote and stdio entries", () => {
  const entries = parseMcpListOutput(
    "claude.ai Canva: https://canva.example/mcp - ✓ Connected\nlocal: npx -y local-mcp - Needs Auth",
  );
  assert.deepEqual(entries.map((entry) => [entry.id, entry.scope, entry.status]), [
    ["claude.ai Canva", "connector", "connected"],
    ["local", "global", "needs-auth"],
  ]);
});

test("mcpListInvocation: win32 の .cmd/拡張子なしは cmd.exe 経由、.exe と非Windowsは直接起動", () => {
  const cmdEnv = { ComSpec: "C:\\Windows\\system32\\cmd.exe" };
  const viaCmd = mcpListInvocation("win32", 500, cmdEnv, "C:\\Users\\u\\AppData\\Roaming\\npm\\claude.cmd");
  assert.equal(viaCmd.file, "C:\\Windows\\system32\\cmd.exe");
  assert.deepEqual(viaCmd.args, ["/d", "/s", "/c", "C:\\Users\\u\\AppData\\Roaming\\npm\\claude.cmd mcp list"]);
  assert.equal(viaCmd.options.shell, undefined);
  assert.equal(viaCmd.options.timeout, 500);
  const spaced = mcpListInvocation("win32", 500, cmdEnv, "C:\\Program Files\\x\\claude.cmd");
  assert.equal(spaced.args[3], '"C:\\Program Files\\x\\claude.cmd" mcp list');
  const unresolved = mcpListInvocation("win32", 500, {}, null);
  assert.equal(unresolved.file, "cmd.exe");
  assert.deepEqual(unresolved.args, ["/d", "/s", "/c", "claude mcp list"]);
  const exe = mcpListInvocation("win32", 500, cmdEnv, "C:\\Users\\u\\.local\\bin\\claude.exe");
  assert.equal(exe.file, "C:\\Users\\u\\.local\\bin\\claude.exe");
  assert.deepEqual(exe.args, ["mcp", "list"]);
  for (const platform of ["darwin", "linux"]) {
    const unix = mcpListInvocation(platform, 500, {}, "/Users/u/.local/bin/claude");
    assert.equal(unix.file, "/Users/u/.local/bin/claude");
    assert.deepEqual(unix.args, ["mcp", "list"]);
    assert.equal(mcpListInvocation(platform).file, "claude");
  }
});

test("resolveClaudeExecutable: PATH に無くても ~/.local/bin から見つける", async () => {
  const home = await fs.promises.mkdtemp(path.join(os.tmpdir(), "harness-home-"));
  const emptyPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), "harness-path-"));
  assert.equal(resolveClaudeExecutable({ platform: "darwin", env: { PATH: emptyPath }, homeDir: home }), null);
  const localBin = path.join(home, ".local", "bin");
  await fs.promises.mkdir(localBin, { recursive: true });
  await fs.promises.writeFile(path.join(localBin, "claude"), "#!/bin/sh\n");
  assert.equal(resolveClaudeExecutable({ platform: "darwin", env: { PATH: emptyPath }, homeDir: home }), path.join(localBin, "claude"));
  // PATH 上のものが優先される
  await fs.promises.writeFile(path.join(emptyPath, "claude"), "#!/bin/sh\n");
  assert.equal(resolveClaudeExecutable({ platform: "darwin", env: { PATH: emptyPath }, homeDir: home }), path.join(emptyPath, "claude"));
  // win32: APPDATA\npm の claude.cmd
  const appdata = await fs.promises.mkdtemp(path.join(os.tmpdir(), "harness-appdata-"));
  await fs.promises.mkdir(path.join(appdata, "npm"), { recursive: true });
  await fs.promises.writeFile(path.join(appdata, "npm", "claude.cmd"), "@echo off\n");
  const winHome = await fs.promises.mkdtemp(path.join(os.tmpdir(), "harness-winhome-"));
  assert.equal(resolveClaudeExecutable({ platform: "win32", env: { Path: "", APPDATA: appdata }, homeDir: winHome }), path.join(appdata, "npm", "claude.cmd"));
});
