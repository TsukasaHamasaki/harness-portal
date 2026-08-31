import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { findSecretLike } from "../shared/redact.mjs";
import { DEFAULT_DATA_DIR } from "./snapshot-store.mjs";
import { buildSnapshot, parseArgs } from "./index.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fakeClaudeDir = path.join(projectDir, "fixtures", "fake-claude");

async function waitForFile(filePath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await fs.promises.readFile(filePath, "utf8");
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

test("parseArgs covers the contract options and defaults", () => {
  assert.deepEqual(parseArgs([]), {
    out: null,
    stdout: false,
    noAgent: false,
    noOpen: false,
    noSave: false,
    noRecipes: false,
    port: 4477,
    portExplicit: false,
    claudeDir: path.join(os.homedir(), ".claude"),
    dataDir: DEFAULT_DATA_DIR,
  });
  assert.deepEqual(parseArgs([
    "--out", "snapshot.json",
    "--stdout",
    "--no-agent",
    "--no-open",
    "--no-save",
    "--no-recipes",
    "--port", "4488",
    "--claude-dir", "fixtures/fake-claude",
    "--data-dir", "fixtures/harness-data",
  ]), {
    out: "snapshot.json",
    stdout: true,
    noAgent: true,
    noOpen: true,
    noSave: true,
    noRecipes: true,
    port: 4488,
    portExplicit: true,
    claudeDir: "fixtures/fake-claude",
    dataDir: "fixtures/harness-data",
  });
});

test("parseArgs sets noRecipes true only when --no-recipes is passed", () => {
  assert.equal(parseArgs([]).noRecipes, false);
  assert.equal(parseArgs(["--no-recipes"]).noRecipes, true);
});

test("parseArgs rejects unknown and incomplete options", () => {
  assert.throws(() => parseArgs(["--unknown"]), /unknown option/);
  assert.throws(() => parseArgs(["--out"]), /requires a value/);
  assert.throws(() => parseArgs(["--port", "not-a-port"]), /must be an integer/);
});

function runFakeCli(dataDir, extraArgs = []) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-portal-save-cli-"));
  const binDir = path.join(tempDir, "bin");
  fs.mkdirSync(binDir);
  const claudeStub = path.join(binDir, "claude");
  fs.writeFileSync(claudeStub, "#!/bin/sh\nexit 0\n", "utf8");
  fs.chmodSync(claudeStub, 0o755);
  try {
    return spawnSync(process.execPath, [
      path.join(projectDir, "cli", "index.mjs"),
      "--claude-dir", fakeClaudeDir,
      "--no-agent",
      "--stdout",
      "--data-dir", dataDir,
      ...extraArgs,
    ], {
      cwd: projectDir,
      encoding: "utf8",
      env: { ...process.env, PATH: binDir + path.delimiter + (process.env.PATH || "") },
      maxBuffer: 4 * 1024 * 1024,
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("CLI saves two runs under data-dir and no-save suppresses local files", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-portal-save-"));
  const noSaveDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-portal-no-save-"));
  try {
    assert.equal(runFakeCli(dataDir).status, 0);
    assert.equal(runFakeCli(dataDir).status, 0);
    const files = fs.readdirSync(path.join(dataDir, "snapshots"));
    assert.equal(files.length, 2);
    assert.notEqual(files[0], files[1]);
    assert.equal(fs.statSync(path.join(dataDir, "snapshots")).mode & 0o777, 0o700);
    for (const file of files) assert.equal(fs.statSync(path.join(dataDir, "snapshots", file)).mode & 0o777, 0o600);

    assert.equal(runFakeCli(noSaveDir, ["--no-save"]).status, 0);
    assert.equal(fs.existsSync(path.join(noSaveDir, "snapshots")), false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(noSaveDir, { recursive: true, force: true });
  }
});

test("CLI continues with a warning when local snapshot saving fails", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-portal-save-failure-"));
  const dataPath = path.join(tempDir, "not-a-directory");
  fs.writeFileSync(dataPath, "file", "utf8");
  try {
    const result = runFakeCli(dataPath);
    assert.equal(result.status, 0, result.stderr);
    const snapshot = JSON.parse(result.stdout);
    assert.ok(snapshot.warnings.some((warning) => warning.includes("Local snapshot save failed")));
    assert.deepEqual(findSecretLike(snapshot), []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("buildSnapshot connects collection to rule classification and emits schema-safe data", async () => {
  const snapshot = await buildSnapshot({
    claudeDir: fakeClaudeDir,
    homeDir: path.join(projectDir, "fixtures"),
    noAgent: true,
    runMcpList: false,
  });

  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.exporter.classifier, "rule");
  assert.ok(snapshot.counts.skills >= 1);
  assert.ok(snapshot.mcpServers.length >= 2);
  assert.equal("category" in snapshot.plugins[0], false);
  assert.equal("projectLabel" in snapshot.mcpServers[0], false);
  const projectEntry = snapshot.mcpServers.find((item) => item.id === "project-fixture");
  assert.equal(projectEntry.projectLabel, "private-project");
  assert.deepEqual(findSecretLike(snapshot), []);
});

test("no-agent build passes the no-agent switch to classification", async () => {
  let receivedOptions;
  const snapshot = await buildSnapshot({
    claudeDir: fakeClaudeDir,
    homeDir: path.join(projectDir, "fixtures"),
    noAgent: true,
    runMcpList: false,
    classifyImpl: async (_items, options) => {
      receivedOptions = options;
      return { categories: new Map(), mode: "none", warnings: [] };
    },
  });
  assert.equal(receivedOptions.noAgent, true);
  assert.equal(snapshot.exporter.classifier, "none");
});

test("buildSnapshot enforces safe v2 output at the CLI boundary", async () => {
  const snapshot = await buildSnapshot({
    claudeDir: fakeClaudeDir,
    noAgent: true,
    runMcpList: false,
    collectImpl: async () => ({
      schemaVersion: 2,
      exportedAt: "2026-08-15T01:23:45.000Z",
      exporter: { kind: "cli", version: "1.0.0", classifier: "none" },
      environment: { os: "darwin", claudeVersion: null, model: null, language: null },
      counts: { skills: 1, agents: 0, mcpServers: 0, plugins: 0, commands: 0 },
      skills: [{ id: "unsafe", name: "unsafe", description: "", scope: "invalid", triggers: [], category: null }],
      agents: [],
      mcpServers: [],
      plugins: [],
      commands: [],
      hooks: [],
      permissions: { defaultMode: null, allowCount: 0, categories: {} },
      claudeMd: { sections: [] },
      settings: { model: null, effortLevel: null, envKeyNames: ["SAFE_NAME", "FIXTURE_API_KEY"] },
      warnings: [],
    }),
    classifyImpl: async () => ({
      categories: new Map([["skill:unsafe", "not-a-category"]]),
      mode: "rule",
      warnings: [],
    }),
  });

  assert.equal(snapshot.skills[0].scope, "user");
  assert.equal(snapshot.skills[0].category, null);
  assert.deepEqual(snapshot.settings.envKeyNames, ["SAFE_NAME"]);
  assert.deepEqual(findSecretLike(snapshot), []);
});

test("CLI launched through a symlink emits JSON through the npm bin path", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-portal-bin-"));
  const binDir = path.join(tempDir, "bin");
  const linkPath = path.join(tempDir, "harness-portal");
  const claudeStub = path.join(binDir, "claude");
  const dataDir = path.join(tempDir, "data");

  try {
    fs.mkdirSync(binDir);
    fs.symlinkSync(path.join(projectDir, "cli", "index.mjs"), linkPath);
    fs.writeFileSync(claudeStub, "#!/bin/sh\nexit 0\n", "utf8");
    fs.chmodSync(claudeStub, 0o755);

    const result = spawnSync(process.execPath, [
      linkPath,
      "--claude-dir", fakeClaudeDir,
      "--no-agent",
      "--stdout",
      "--data-dir", dataDir,
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: binDir + path.delimiter + (process.env.PATH || ""),
      },
      maxBuffer: 4 * 1024 * 1024,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.error, undefined);
    assert.ok(result.stdout.length > 0, "symlinked npm bin invocation must write JSON");
    const snapshot = JSON.parse(result.stdout);
    assert.equal(snapshot.schemaVersion, 2);
    assert.equal(snapshot.exporter.classifier, "rule");
    assert.deepEqual(findSecretLike(snapshot), []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("run waits for the assigned port before displaying and opening the URL", { skip: process.platform === "win32" }, async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-portal-run-"));
  const binDir = path.join(tempDir, "bin");
  const openUrlPath = path.join(tempDir, "opened-url.txt");
  const openCommand = process.platform === "darwin" ? "open" : "xdg-open";
  const dataDir = path.join(tempDir, "data");
  const childArgs = [
    path.join(projectDir, "cli", "index.mjs"),
    "--claude-dir", fakeClaudeDir,
    "--no-agent",
    "--port", "0",
    "--data-dir", dataDir,
  ];
  const childEnv = {
    ...process.env,
    PATH: binDir + path.delimiter + (process.env.PATH || ""),
    HARNESS_OPEN_URL_FILE: openUrlPath,
  };

  fs.mkdirSync(binDir);
  fs.writeFileSync(path.join(binDir, "claude"), "#!/bin/sh\nexit 0\n", "utf8");
  fs.writeFileSync(
    path.join(binDir, openCommand),
    "#!/bin/sh\nprintf '%s\\n' \"$1\" > \"$HARNESS_OPEN_URL_FILE\"\n",
    "utf8",
  );
  fs.chmodSync(path.join(binDir, "claude"), 0o755);
  fs.chmodSync(path.join(binDir, openCommand), 0o755);

  const child = spawn(process.execPath, childArgs, {
    cwd: projectDir,
    env: childEnv,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  try {
    const output = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for CLI startup")), 5000);
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
        if (stderr.includes("Harness Portal:")) {
          clearTimeout(timer);
          resolve(stderr);
        }
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code) => {
        if (code !== null && code !== 0) {
          clearTimeout(timer);
          reject(new Error(`CLI exited before startup: ${code}\n${stderr}`));
        }
      });
    });
    const displayedUrl = output.match(/Harness Portal: (http:\/\/localhost:\d+)/)?.[1];
    assert.match(displayedUrl || "", /^http:\/\/localhost:[1-9]\d*$/);

    const openedUrl = (await waitForFile(openUrlPath)).trim();
    assert.equal(openedUrl, displayedUrl);

    const response = await fetch(displayedUrl + "/api/snapshot");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).schemaVersion, 2);
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
