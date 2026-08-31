#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { maskDeep } from "../shared/redact.mjs";

const execFile = promisify(execFileCallback);
const MCP_TIMEOUT_MS = 20_000;
const EXPORTER_VERSION = "1.0.0";

export const ALLOWLIST_PATTERNS = [
  "skills/*/SKILL.md",
  "agents/*.md",
  "commands/*.md",
  "settings.json",
  "plugins/installed_plugins.json",
  "CLAUDE.md",
  "<home>/.claude.json",
];

function existingFile(filePath) {
  try {
    return fs.statSync(filePath).isFile() ? filePath : null;
  } catch {
    return null;
  }
}

function readText(filePath) {
  const existing = existingFile(filePath);
  return existing ? fs.readFileSync(existing, "utf8") : null;
}

function readJson(filePath, warnings, label) {
  const text = readText(filePath);
  if (text === null) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    warnings.push(label + " could not be parsed; skipped");
    return {};
  }
}

function listFiles(directory, predicate) {
  try {
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .filter(predicate)
      .map((entry) => path.join(directory, entry.name))
      .sort();
  } catch {
    return [];
  }
}

export function listSkillFiles(claudeDir) {
  const skillsDir = path.join(claudeDir, "skills");
  return listFiles(skillsDir, (entry) => entry.isDirectory())
    .map((directory) => path.join(directory, "SKILL.md"))
    .filter((filePath) => existingFile(filePath));
}

export function listAgentFiles(claudeDir) {
  return listFiles(path.join(claudeDir, "agents"), (entry) => entry.isFile() && entry.name.endsWith(".md"));
}

export function listCommandFiles(claudeDir) {
  return listFiles(path.join(claudeDir, "commands"), (entry) => entry.isFile() && entry.name.endsWith(".md"));
}

export function claudeJsonPath(homeDir) {
  return existingFile(path.join(homeDir, ".claude.json"));
}

export function settingsJsonPath(claudeDir) {
  return existingFile(path.join(claudeDir, "settings.json"));
}

export function installedPluginsPath(claudeDir) {
  return existingFile(path.join(claudeDir, "plugins", "installed_plugins.json"));
}

export function claudeMdPath(claudeDir) {
  return existingFile(path.join(claudeDir, "CLAUDE.md"));
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed.at(-1) !== quote) return trimmed;
  if (quote === '"') {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed.slice(1, -1).replace(/''/g, "'");
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : unquote(trimmed);
    } catch {
      return unquote(trimmed);
    }
  }
  return unquote(trimmed.replace(/\s+#.*$/, ""));
}

/** Parse only name/description/tools/model and block scalars from frontmatter. */
export function extractFrontmatter(content) {
  if (typeof content !== "string") return {};
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};

  const lines = match[1].split(/\r?\n/);
  const result = {};
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const keyMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
    if (!keyMatch) continue;
    const key = keyMatch[1];
    const rawValue = keyMatch[2] || "";
    if (rawValue === ">" || rawValue === ">-" || rawValue === "|" || rawValue === "|-") {
      const blockLines = [];
      let blockIndent = null;
      while (index + 1 < lines.length) {
        const nextLine = lines[index + 1];
        if (!nextLine.trim()) {
          blockLines.push("");
          index += 1;
          continue;
        }
        const indent = nextLine.match(/^\s*/)[0].length;
        if (indent === 0) break;
        blockIndent ??= indent;
        blockLines.push(nextLine.slice(blockIndent));
        index += 1;
      }
      result[key] = rawValue.startsWith(">")
        ? blockLines.join(" ").trim()
        : blockLines.join("\n").trim();
      continue;
    }
    result[key] = parseScalar(rawValue);
  }
  return result;
}

export function extractTriggers(description) {
  if (typeof description !== "string") return [];
  return (description.match(/「[^」]*」/g) || []).slice(0, 8).map((match) => match.slice(1, -1));
}

function frontmatterFor(filePath) {
  const content = readText(filePath);
  return content === null ? {} : extractFrontmatter(content);
}

function collectSkills(claudeDir) {
  return listSkillFiles(claudeDir).flatMap((filePath) => {
    const frontmatter = frontmatterFor(filePath);
    if (typeof frontmatter.name !== "string" || !frontmatter.name) return [];
    const description = typeof frontmatter.description === "string" ? frontmatter.description : "";
    return [{
      id: frontmatter.name,
      name: frontmatter.name,
      description,
      scope: "user",
      triggers: extractTriggers(description),
      category: null,
    }];
  });
}

function collectAgents(claudeDir) {
  return listAgentFiles(claudeDir).flatMap((filePath) => {
    const frontmatter = frontmatterFor(filePath);
    if (typeof frontmatter.name !== "string" || !frontmatter.name) return [];
    const tools = Array.isArray(frontmatter.tools)
      ? frontmatter.tools.filter((tool) => typeof tool === "string")
      : typeof frontmatter.tools === "string"
        ? frontmatter.tools.split(",").map((tool) => tool.trim()).filter(Boolean)
        : [];
    return [{
      id: frontmatter.name,
      description: typeof frontmatter.description === "string" ? frontmatter.description : "",
      tools,
      model: typeof frontmatter.model === "string" && frontmatter.model ? frontmatter.model : null,
      category: null,
    }];
  });
}

export function isSecretLikeArg(arg) {
  if (typeof arg !== "string" || !/^-{1,2}\S/.test(arg)) return false;
  const optionName = arg.split("=", 1)[0];
  return /token|key|secret|password|auth|credential/i.test(optionName);
}

function removeSecretLikeArgs(rawArgs) {
  const safeArgs = [];
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (isSecretLikeArg(arg)) {
      if (!arg.includes("=") && index + 1 < rawArgs.length) {
        index += 1;
      }
      continue;
    }
    safeArgs.push(arg);
  }
  return safeArgs;
}

function summarizeStdioServer(server) {
  const command = typeof server?.command === "string" ? server.command : "";
  const rawArgs = Array.isArray(server?.args) ? server.args.filter((arg) => typeof arg === "string") : [];
  const safeArgs = removeSecretLikeArgs(rawArgs);
  return {
    transport: "stdio",
    commandSummary: [command, ...safeArgs.slice(0, 2)].filter(Boolean).join(" "),
  };
}

function summarizeCommandText(commandText) {
  const parts = String(commandText || "").split(/\s+/).filter(Boolean);
  const command = parts.shift() || "";
  return [command, ...removeSecretLikeArgs(parts).slice(0, 2)].filter(Boolean).join(" ");
}

function summarizeRemoteServer(server) {
  let host = "";
  try {
    host = new URL(server.url).hostname;
  } catch {
    // Do not expose a malformed URL.
  }
  return { transport: server?.type === "sse" ? "sse" : "http", host };
}

export function buildMcpEntry(id, server = {}, scope, projectLabel, status) {
  const remote = typeof server.url === "string" && server.url.length > 0;
  const transportInfo = remote ? summarizeRemoteServer(server) : summarizeStdioServer(server);
  const entry = { id, scope, ...transportInfo, category: null };
  if (projectLabel) entry.projectLabel = projectLabel;
  if (status) entry.status = status;
  return entry;
}

function connectorScope(id, server, fallbackScope) {
  return server?.scope === "connector" || /^claude\.ai(?:\b|[_:])/i.test(id) ? "connector" : fallbackScope;
}

function configMcpEntries(raw) {
  const entries = [];
  const globalServers = raw?.mcpServers && typeof raw.mcpServers === "object" ? raw.mcpServers : {};
  for (const [id, server] of Object.entries(globalServers)) {
    entries.push(buildMcpEntry(id, server, connectorScope(id, server, "global"), undefined, "unknown"));
  }

  const projects = raw?.projects && typeof raw.projects === "object" ? raw.projects : {};
  for (const [projectPath, project] of Object.entries(projects)) {
    const projectServers = project?.mcpServers && typeof project.mcpServers === "object" ? project.mcpServers : {};
    for (const [id, server] of Object.entries(projectServers)) {
      entries.push(buildMcpEntry(id, server, connectorScope(id, server, "project"), path.basename(projectPath), "unknown"));
    }
  }
  return entries;
}

function statusFromLine(line) {
  if (/needs?\s*(auth|authentication)|not\s*authenticated|login\s|required/i.test(line)) return "needs-auth";
  if (/failed|error|disconnected|unavailable/i.test(line)) return "failed";
  if (/connected|\u2713|\bok\b/i.test(line)) return "connected";
  return "unknown";
}

function parseMcpLine(line) {
  const clean = line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").trim();
  if (!clean || /^(checking|no mcp|mcp servers?\s*:?)$/i.test(clean)) return null;
  const status = statusFromLine(clean);
  const withoutStatus = clean
    .replace(/\s*-?\s*(?:\u2713\s*)?(?:Connected|Needs Auth|Authentication Required|Failed|Error|Disconnected|OK)\s*$/i, "")
    .trim();
  const colon = withoutStatus.indexOf(":");
  if (colon <= 0) return null;
  const id = withoutStatus.slice(0, colon).replace(/^[\u2713✗•\s]+/, "").trim();
  const details = withoutStatus.slice(colon + 1).replace(/^\s+/, "").replace(/\s+-\s*$/, "").trim();
  if (!id || /^(checking|warning|error)$/i.test(id)) return null;

  const isConnector = /^claude\.ai(?:\b|[_:])/i.test(id) || /claude\.ai/i.test(details);
  const type = /\bsse\b/i.test(details) ? "sse" : /https?:\/\//i.test(details) ? "http" : "stdio";
  const entry = { id, scope: isConnector ? "connector" : "global", transport: type, status, category: null };
  if (type === "http" || type === "sse") {
    const urlMatch = details.match(/https?:\/\/[^\s)]+/i);
    try {
      if (urlMatch) entry.host = new URL(urlMatch[0]).hostname;
    } catch {
      // Keep the safe empty host.
    }
  } else if (details && !/^\u2713?\s*(connected|failed|error)$/i.test(details)) {
    entry.commandSummary = summarizeCommandText(details.split(/\s+-\s+/)[0].trim());
  }
  return entry;
}

export function parseMcpListOutput(output) {
  return String(output || "").split(/\r?\n/).map(parseMcpLine).filter(Boolean);
}

const WINDOWS_SCRIPT_EXTENSIONS = [".cmd", ".bat"];

function isExecutableFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * `claude` の実体を探す。PATH に無くても、Claude Code の既知のインストール先を見る。
 * （ネイティブインストーラーは ~/.local/bin に置くが、npx を動かしたシェルの PATH に
 * 入っていないことがある。office の Mac mini と、報告のあった Windows 環境で実際に起きた）
 */
export function resolveClaudeExecutable({ platform = process.platform, env = process.env, homeDir = os.homedir() } = {}) {
  const isWindows = platform === "win32";
  const names = isWindows ? ["claude.exe", "claude.cmd", "claude.bat", "claude"] : ["claude"];
  const pathDirs = String(env.PATH || env.Path || "").split(isWindows ? ";" : ":").filter(Boolean);
  const knownDirs = isWindows
    ? [
        path.join(homeDir, ".local", "bin"),
        env.APPDATA ? path.join(env.APPDATA, "npm") : null,
        env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Programs", "claude") : null,
      ]
    : [
        path.join(homeDir, ".local", "bin"),
        path.join(homeDir, ".claude", "local"),
        "/opt/homebrew/bin",
        "/usr/local/bin",
        path.join(homeDir, ".npm-global", "bin"),
      ];
  for (const dir of [...pathDirs, ...knownDirs.filter(Boolean)]) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Windows の npm 版 Claude Code は実体が `claude.cmd` で、shell を介さない execFile では
 * 起動できない。その場合だけ cmd.exe に固定文字列のコマンドを渡す（`shell: true` は
 * Node 24 が DEP0190 警告を出すので使わない）。パスはこちらで解決した値のみを使い、
 * ユーザー入力を含まないので注入の余地はない。
 */
export function mcpListInvocation(platform = process.platform, timeoutMs = MCP_TIMEOUT_MS, env = process.env, executable = null) {
  const options = { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, windowsHide: true };
  const target = executable || "claude";
  if (platform === "win32") {
    const lower = target.toLowerCase();
    const isScript = WINDOWS_SCRIPT_EXTENSIONS.some((ext) => lower.endsWith(ext)) || !path.extname(target);
    if (isScript) {
      const quoted = target.includes(" ") ? `"${target}"` : target;
      return { file: env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", `${quoted} mcp list`], options };
    }
  }
  return { file: target, args: ["mcp", "list"], options };
}

export async function runMcpListCommand({ timeoutMs = MCP_TIMEOUT_MS } = {}) {
  const executable = resolveClaudeExecutable();
  const { file, args, options } = mcpListInvocation(process.platform, timeoutMs, process.env, executable);
  const result = await execFile(file, args, options);
  return result.stdout || result.stderr || "";
}

function timeoutError(timeoutMs) {
  const error = new Error("claude mcp list timed out after " + timeoutMs + " milliseconds");
  error.name = "TimeoutError";
  return error;
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(timeoutError(timeoutMs)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function mergeMcpEntries(configEntries, listedEntries) {
  const merged = configEntries.map((entry) => ({ ...entry }));
  for (const listed of listedEntries) {
    const match = merged.find((entry) =>
      entry.id === listed.id && (entry.scope === listed.scope || listed.scope === "connector" || entry.scope === "connector"),
    );
    if (match) Object.assign(match, listed);
    else merged.push(listed);
  }
  return merged;
}

async function collectMcpServers({ rawConfig, runMcpList, warnings, mcpListImpl, timeoutMs = MCP_TIMEOUT_MS }) {
  const configEntries = configMcpEntries(rawConfig);
  if (!runMcpList) return configEntries;

  try {
    const output = mcpListImpl
      ? await withTimeout(mcpListImpl({ timeoutMs }), timeoutMs)
      : await runMcpListCommand({ timeoutMs });
    return mergeMcpEntries(configEntries, parseMcpListOutput(output));
  } catch (error) {
    const reason = error?.name === "TimeoutError" || error?.killed || error?.signal === "SIGTERM"
      ? "timed out after 20 seconds"
      : "failed";
    warnings.push("claude mcp list " + reason + "; fell back to .claude.json");
    return configEntries;
  }
}

function collectPlugins(claudeDir, warnings) {
  const raw = readJson(path.join(claudeDir, "plugins", "installed_plugins.json"), warnings, "installed_plugins.json");
  const pluginsObj = raw.plugins && typeof raw.plugins === "object" ? raw.plugins : {};
  const plugins = [];
  for (const [key, entries] of Object.entries(pluginsObj)) {
    if (!Array.isArray(entries) || !entries.length || !entries[0] || typeof entries[0] !== "object") continue;
    const separator = key.lastIndexOf("@");
    const id = separator === -1 ? key : key.slice(0, separator);
    const marketplace = separator === -1 ? "" : key.slice(separator + 1);
    const entry = entries[0];
    plugins.push({
      id,
      marketplace,
      version: typeof entry.version === "string" ? entry.version : "",
      enabled: entry.enabled !== false,
      installedAt: typeof entry.installedAt === "string" ? entry.installedAt : "",
      category: null,
    });
  }
  return plugins;
}

function collectHooks(settings) {
  const hooks = settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {};
  return Object.entries(hooks).map(([event, values]) => ({ event, count: Array.isArray(values) ? values.length : 0 }));
}

export function categorizePermission(entry) {
  if (typeof entry !== "string") return "other";
  if (entry.startsWith("Bash(")) return "bash";
  if (entry.startsWith("mcp__")) return "mcp";
  return "other";
}

function collectPermissions(settings) {
  const allow = settings.permissions?.allow;
  const list = Array.isArray(allow) ? allow : [];
  const categories = { Bash: 0, MCP: 0, Other: 0 };
  for (const entry of list) {
    const category = categorizePermission(entry);
    categories[category === "bash" ? "Bash" : category === "mcp" ? "MCP" : "Other"] += 1;
  }
  return {
    defaultMode: typeof settings.permissions?.defaultMode === "string"
      ? settings.permissions.defaultMode
      : typeof settings.defaultMode === "string" ? settings.defaultMode : null,
    allowCount: list.length,
    categories,
  };
}

function collectClaudeMd(claudeDir) {
  const content = readText(path.join(claudeDir, "CLAUDE.md"));
  if (content === null) return { sections: [] };
  return {
    sections: content.split(/\r?\n/).flatMap((line) => line.startsWith("## ") ? [line.slice(3).trim()] : []),
  };
}

function collectSettingsSummary(settings) {
  const env = settings.env && typeof settings.env === "object" && !Array.isArray(settings.env) ? settings.env : {};
  return {
    model: typeof settings.model === "string" ? settings.model : null,
    effortLevel: typeof settings.effortLevel === "string" ? settings.effortLevel : null,
    envKeyNames: Object.keys(env),
  };
}

function nullOutCategories(items) {
  return items.map((item) => ({ ...item, category: null }));
}

/** Read the explicit allowlist and return a v2 snapshot. */
export async function collect({ claudeDir = path.join(os.homedir(), ".claude"), homeDir, runMcpList = true, mcpListImpl, mcpTimeoutMs = MCP_TIMEOUT_MS } = {}) {
  const resolvedClaudeDir = path.resolve(claudeDir);
  const resolvedHomeDir = path.resolve(homeDir || path.dirname(resolvedClaudeDir));
  const warnings = [];

  const skills = nullOutCategories(collectSkills(resolvedClaudeDir));
  const agents = nullOutCategories(collectAgents(resolvedClaudeDir));
  const commands = listCommandFiles(resolvedClaudeDir).map((filePath) => ({
    id: path.basename(filePath, ".md"),
    scope: "user",
  }));

  const settings = readJson(path.join(resolvedClaudeDir, "settings.json"), warnings, "settings.json");
  const rawConfig = readJson(path.join(resolvedHomeDir, ".claude.json"), warnings, ".claude.json");
  const mcpServers = await collectMcpServers({ rawConfig, runMcpList, warnings, mcpListImpl, timeoutMs: mcpTimeoutMs });
  const plugins = collectPlugins(resolvedClaudeDir, warnings);

  const snapshot = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    exporter: { kind: "cli", version: EXPORTER_VERSION, classifier: "none" },
    environment: {
      os: process.platform,
      claudeVersion: null,
      model: typeof settings.model === "string" ? settings.model : null,
      language: typeof process.env.LANG === "string" ? process.env.LANG : null,
    },
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
    hooks: collectHooks(settings),
    permissions: collectPermissions(settings),
    claudeMd: collectClaudeMd(resolvedClaudeDir),
    settings: collectSettingsSummary(settings),
    warnings,
  };

  return maskDeep(snapshot);
}
