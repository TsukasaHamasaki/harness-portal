#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { classifyItems } from "./classify.mjs";
import { buildRecipes } from "./recipes.mjs";
import { collect } from "./collect.mjs";
import { resolveServePort, serve } from "./serve.mjs";
import { DEFAULT_DATA_DIR, saveSnapshot } from "./snapshot-store.mjs";
import { isCategoryId } from "../shared/categories.mjs";
import { maskDeep } from "../shared/redact.mjs";

const DEFAULT_PORT = 4477;
const EXPORTER_VERSION = "1.0.0";
const EXPORTER_KINDS = new Set(["cli", "paste"]);
const CLASSIFIER_MODES = new Set(["agent", "rule", "none"]);
const SKILL_SCOPES = new Set(["user", "project", "plugin"]);
const MCP_SCOPES = new Set(["global", "project", "connector"]);
const MCP_TRANSPORTS = new Set(["stdio", "http", "sse"]);
const MCP_STATUSES = new Set(["connected", "needs-auth", "failed", "unknown"]);
const SECRET_KEY_NAME_RE = /token|key|secret|password|auth/i;

function valueAfter(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function parsePort(value) {
  if (!/^\d+$/.test(value)) throw new Error(`--port must be an integer: ${value}`);
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error(`--port must be between 0 and 65535: ${value}`);
  }
  return port;
}

/** Parse only the options in contract 4. */
export function parseArgs(argv = []) {
  const options = {
    out: null,
    stdout: false,
    noAgent: false,
    noOpen: false,
    noSave: false,
    noRecipes: false,
    port: DEFAULT_PORT,
    portExplicit: false,
    claudeDir: path.join(os.homedir(), ".claude"),
    dataDir: DEFAULT_DATA_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stdout") {
      options.stdout = true;
    } else if (arg === "--no-agent") {
      options.noAgent = true;
    } else if (arg === "--no-open") {
      options.noOpen = true;
    } else if (arg === "--no-save") {
      options.noSave = true;
    } else if (arg === "--no-recipes") {
      options.noRecipes = true;
    } else if (arg === "--out") {
      options.out = valueAfter(argv, index, "--out");
      index += 1;
    } else if (arg === "--port") {
      options.port = parsePort(valueAfter(argv, index, "--port"));
      options.portExplicit = true;
      index += 1;
    } else if (arg === "--claude-dir") {
      options.claudeDir = valueAfter(argv, index, "--claude-dir");
      index += 1;
    } else if (arg === "--data-dir") {
      options.dataDir = valueAfter(argv, index, "--data-dir");
      index += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  return options;
}

function itemId(kind, id) {
  return `${kind}:${id}`;
}

function objectOrEmpty(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringValue(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableStringValue(value) {
  return typeof value === "string" ? value : null;
}

function nonNegativeInteger(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function enumValue(value, allowed, fallback) {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}

function stringArrayValue(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function classificationItems(snapshot) {
  return [
    ...snapshot.skills.map((item) => ({
      id: itemId("skill", item.id),
      kind: "skill",
      name: item.name,
      description: item.description,
    })),
    ...snapshot.agents.map((item) => ({
      id: itemId("agent", item.id),
      kind: "agent",
      name: item.id,
      description: item.description,
    })),
    ...snapshot.mcpServers.map((item) => ({
      id: itemId("mcp", item.id),
      kind: "mcp",
      name: item.id,
      description: [item.commandSummary, item.host, item.status].filter(Boolean).join(" / "),
    })),
    ...snapshot.plugins.map((item) => ({
      id: itemId("plugin", item.id),
      kind: "plugin",
      name: item.id,
      description: [item.marketplace, item.version].filter(Boolean).join(" / "),
    })),
    ...snapshot.commands.map((item) => ({
      id: itemId("command", item.id),
      kind: "command",
      name: item.id,
      description: item.scope,
    })),
  ];
}

function categoryFor(categories, id) {
  const category = categories instanceof Map ? categories.get(id) : null;
  return isCategoryId(category) ? category : null;
}

function normalizeSnapshot(snapshot, classification, recipes = []) {
  const source = objectOrEmpty(snapshot);
  const categories = classification?.categories;
  const mode = CLASSIFIER_MODES.has(classification?.mode) ? classification.mode : "none";
  const recipeList = Array.isArray(recipes?.recipes)
    ? recipes.recipes
    : Array.isArray(recipes)
      ? recipes
      : [];
  const warnings = [
    ...stringArrayValue(source.warnings),
    ...stringArrayValue(classification?.warnings),
    ...stringArrayValue(recipes?.warnings),
  ];

  const skills = (Array.isArray(source.skills) ? source.skills : []).map((item) => ({
    id: stringValue(item?.id),
    name: stringValue(item?.name),
    description: stringValue(item?.description),
    scope: enumValue(item?.scope, SKILL_SCOPES, "user"),
    triggers: stringArrayValue(item?.triggers),
    category: categoryFor(categories, itemId("skill", item?.id)),
  }));
  const agents = (Array.isArray(source.agents) ? source.agents : []).map((item) => ({
    id: stringValue(item?.id),
    description: stringValue(item?.description),
    tools: stringArrayValue(item?.tools),
    model: nullableStringValue(item?.model),
    category: categoryFor(categories, itemId("agent", item?.id)),
  }));
  const mcpServers = (Array.isArray(source.mcpServers) ? source.mcpServers : []).map((item) => ({
    id: stringValue(item?.id),
    scope: enumValue(item?.scope, MCP_SCOPES, "global"),
    transport: enumValue(item?.transport, MCP_TRANSPORTS, "stdio"),
    ...(typeof item?.commandSummary === "string" ? { commandSummary: item.commandSummary } : {}),
    ...(typeof item?.host === "string" ? { host: item.host } : {}),
    ...(typeof item?.projectLabel === "string" ? { projectLabel: item.projectLabel } : {}),
    status: enumValue(item?.status, MCP_STATUSES, "unknown"),
    category: categoryFor(categories, itemId("mcp", item?.id)),
  }));
  const plugins = (Array.isArray(source.plugins) ? source.plugins : []).map((item) => ({
    id: stringValue(item?.id),
    marketplace: stringValue(item?.marketplace),
    version: stringValue(item?.version),
    enabled: item?.enabled !== false,
    installedAt: stringValue(item?.installedAt),
  }));
  const commands = (Array.isArray(source.commands) ? source.commands : []).map((item) => ({
    id: stringValue(item?.id),
    scope: enumValue(item?.scope, SKILL_SCOPES, "user"),
  }));

  const rawPermissions = objectOrEmpty(source.permissions);
  const permissionCategories = Object.fromEntries(
    Object.entries(objectOrEmpty(rawPermissions.categories))
      .filter(([, value]) => Number.isInteger(value) && value >= 0)
      .map(([key, value]) => [key, value]),
  );
  const permissions = {
    defaultMode: nullableStringValue(rawPermissions.defaultMode),
    allowCount: nonNegativeInteger(rawPermissions.allowCount),
    categories: permissionCategories,
  };
  const rawSettings = objectOrEmpty(source.settings);
  const settings = {
    model: nullableStringValue(rawSettings.model),
    effortLevel: nullableStringValue(rawSettings.effortLevel),
    envKeyNames: stringArrayValue(rawSettings.envKeyNames).filter((key) => !SECRET_KEY_NAME_RE.test(key)),
  };
  const rawEnvironment = objectOrEmpty(source.environment);
  const environment = {
    os: stringValue(rawEnvironment.os, process.platform),
    claudeVersion: nullableStringValue(rawEnvironment.claudeVersion),
    model: nullableStringValue(rawEnvironment.model),
    language: nullableStringValue(rawEnvironment.language),
  };
  const rawClaudeMd = objectOrEmpty(source.claudeMd);
  const hooks = (Array.isArray(source.hooks) ? source.hooks : []).map((hook) => ({
    event: stringValue(hook?.event),
    count: nonNegativeInteger(hook?.count),
  }));

  const normalized = {
    schemaVersion: 2,
    exportedAt: stringValue(source.exportedAt, new Date().toISOString()),
    exporter: {
      kind: enumValue(source.exporter?.kind, EXPORTER_KINDS, "cli"),
      version: stringValue(source.exporter?.version, EXPORTER_VERSION),
      classifier: mode,
    },
    environment,
    counts: {
      skills: skills.length,
      agents: agents.length,
      mcpServers: mcpServers.length,
      plugins: plugins.length,
      commands: commands.length,
    },
    skills,
    agents,
    mcpServers,
    plugins,
    commands,
    hooks,
    permissions,
    claudeMd: { sections: stringArrayValue(rawClaudeMd.sections) },
    settings,
    recipes: recipeList,
    warnings,
  };

  return maskDeep(normalized);
}

export async function buildSnapshot({
  claudeDir = path.join(os.homedir(), ".claude"),
  homeDir,
  noAgent = false,
  noRecipes = false,
  runMcpList = true,
  collectImpl = collect,
  classifyImpl = classifyItems,
  recipesImpl = buildRecipes,
  onProgress = () => {},
} = {}) {
  const resolvedClaudeDir = path.resolve(claudeDir);
  onProgress({ phase: "collect:start", claudeDir: resolvedClaudeDir });
  const snapshot = await collectImpl({
    claudeDir: resolvedClaudeDir,
    homeDir: homeDir === undefined ? path.dirname(resolvedClaudeDir) : homeDir,
    runMcpList,
  });
  onProgress({ phase: "collect:done", counts: snapshot.counts });
  const items = classificationItems(snapshot);
  onProgress({ phase: "classify:start", total: items.length, noAgent });
  const classification = await classifyImpl(items, { noAgent });
  onProgress({ phase: "classify:done", mode: classification.mode, reason: classification.failureReason ?? null });

  const recipeItems = items.map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.name,
    summary: item.description ?? "",
    categoryId: categoryFor(classification.categories, item.id),
  }));

  const recipesSkipped = noAgent !== true && noRecipes === true;
  onProgress({ phase: "recipes:start", noAgent, skipped: recipesSkipped });
  let recipesResult;
  if (noAgent === true) {
    recipesResult = await recipesImpl(recipeItems, { noAgent: true });
  } else if (recipesSkipped) {
    recipesResult = { recipes: [], warnings: ["recipes skipped (--no-recipes)"] };
  } else {
    recipesResult = await recipesImpl(recipeItems, {});
  }
  onProgress({ phase: "recipes:done", count: recipesResult.recipes.length, skipped: recipesSkipped, reason: recipesResult.failureReason ?? null });

  return normalizeSnapshot(snapshot, classification, recipesResult);
}

function isInside(parentDir, candidatePath) {
  const relative = path.relative(path.resolve(parentDir), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== "..");
}

function writeSnapshot(outPath, snapshot, claudeDir) {
  const resolvedOut = path.resolve(outPath);
  if (isInside(claudeDir, resolvedOut)) {
    throw new Error("--out must not write inside --claude-dir; the scan tree is read-only");
  }
  fs.writeFileSync(resolvedOut, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
}

function appendSaveWarning(snapshot, error) {
  const reason = typeof error?.code === "string" ? ` (${error.code})` : "";
  if (!Array.isArray(snapshot.warnings)) snapshot.warnings = [];
  snapshot.warnings.push(`Local snapshot save failed; processing continued${reason}`);
}

function saveLocalSnapshot(snapshot, dataDir, noSave) {
  if (noSave) return null;
  try {
    return saveSnapshot(snapshot, dataDir);
  } catch (error) {
    appendSaveWarning(snapshot, error);
    return null;
  }
}

function openBrowser(url) {
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function waitForListening(server) {
  if (server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off("listening", onListening);
      server.off("error", onError);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    server.once("listening", onListening);
    server.once("error", onError);
  });
}

// 収集と分類は合計で1分ほど無音になりうるので、進捗を stderr に出す。
// stdout はスナップショットJSON専用なので汚さない。
export function createProgressReporter(stream = process.stderr) {
  const isTty = Boolean(stream.isTTY);
  let timer = null;
  const stopTimer = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    stream.write("\n");
  };
  return (event) => {
    switch (event.phase) {
      case "collect:start":
        stream.write(`▸ 走査中 ${event.claudeDir}\n`);
        break;
      case "collect:done": {
        const c = event.counts || {};
        stream.write(
          `▸ 収集完了 スキル${c.skills ?? 0} / MCP${c.mcpServers ?? 0} / エージェント${c.agents ?? 0} / プラグイン${c.plugins ?? 0}\n`
        );
        break;
      }
      case "classify:start":
        if (event.noAgent) {
          stream.write(`▸ 分類中 ${event.total}項目（規則ベース）\n`);
          break;
        }
        stream.write(`▸ 分類中 ${event.total}項目 — Claudeに問い合わせています（1分ほどかかります）\n`);
        if (isTty) {
          const startedAt = Date.now();
          timer = setInterval(() => {
            stream.write(`\r  経過 ${Math.round((Date.now() - startedAt) / 1000)}秒`);
          }, 1000);
          timer.unref?.();
        }
        break;
      case "classify:done":
        stopTimer();
        stream.write(`▸ 分類完了 ${event.mode === "agent" ? "Claudeが付与" : "規則ベース"}\n`);
        if (event.reason) stream.write(`  ! ${event.reason}\n`);
        break;
      case "recipes:start":
        if (!event.skipped) stream.write(`▸ フロー生成中 …\n`);
        break;
      case "recipes:done":
        stream.write(event.skipped ? `▸ フロー生成 スキップ\n` : `▸ フロー生成完了 ${event.count}件\n`);
        if (event.reason) stream.write(`  ! ${event.reason}\n`);
        break;
      case "save:done":
        stream.write(event.id ? `▸ 保存 ${event.id}\n` : "▸ 保存 スキップ\n");
        break;
      default:
        break;
    }
  };
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const resolvedClaudeDir = path.resolve(options.claudeDir);
  const report = createProgressReporter();

  // Collection takes a couple of minutes; find out about a busy port before spending them.
  let servePort = options.port;
  if (!options.stdout) {
    servePort = await resolveServePort(options.port, { explicit: options.portExplicit });
    if (servePort !== options.port) {
      process.stderr.write(`▸ ポート ${options.port} は使用中のため ${servePort} を使います\n`);
    }
  }

  const snapshot = await buildSnapshot({
    claudeDir: resolvedClaudeDir,
    noAgent: options.noAgent,
    noRecipes: options.noRecipes,
    onProgress: report,
  });

  const saved = saveLocalSnapshot(snapshot, options.dataDir, options.noSave);
  report({ phase: "save:done", id: saved?.id });
  if (options.out) writeSnapshot(options.out, snapshot, resolvedClaudeDir);
  if (options.stdout) {
    process.stdout.write(JSON.stringify(snapshot) + "\n");
    return { snapshot, server: null };
  }

  const running = serve({ snapshot, port: servePort, dataDir: options.dataDir });
  await waitForListening(running.server);
  const url = running.url;
  if (!options.noOpen) openBrowser(url);
  process.stderr.write(`Harness Portal: ${url}\n`);
  return { snapshot, server: running };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

const isMain = isMainModule();
if (isMain) {
  run().catch((error) => {
    process.stderr.write(`harness-portal: ${error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}
