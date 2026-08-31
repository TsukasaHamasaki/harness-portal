import { isCategoryId } from "../../../shared/categories.mjs";
import type { CategoryId } from "../../../shared/categories.mjs";

export const SCHEMA_VERSION = 2 as const;

export type Exporter = {
  kind: "cli" | "paste";
  version: string;
  classifier: "agent" | "rule" | "none";
};

export type Environment = {
  os: string;
  claudeVersion: string | null;
  model: string | null;
  language: string | null;
};

export type SnapshotCounts = {
  skills: number;
  agents: number;
  mcpServers: number;
  plugins: number;
  commands: number;
};

export type HarnessSkill = {
  id: string;
  name: string;
  description: string;
  scope: "user" | "project" | "plugin";
  triggers: string[];
  category: CategoryId | null;
};

export type HarnessAgent = {
  id: string;
  description: string;
  tools: string[];
  model: string | null;
  category: CategoryId | null;
};

export type HarnessMcpServer = {
  id: string;
  scope: "global" | "project" | "connector";
  transport: "stdio" | "http" | "sse";
  commandSummary?: string;
  host?: string;
  projectLabel?: string;
  status: "connected" | "needs-auth" | "failed" | "unknown";
  category: CategoryId | null;
};

export type HarnessPlugin = {
  id: string;
  marketplace: string;
  version: string;
  enabled: boolean;
  installedAt: string;
};

export type HarnessCommand = {
  id: string;
  scope: "user" | "project" | "plugin";
};

export type HarnessHook = {
  event: string;
  count: number;
};

export type HarnessPermissions = {
  defaultMode: string | null;
  allowCount: number;
  categories: Record<string, number>;
};

export type Recipe = {
  id: string;
  title: string;
  summary: string;
  steps: { phase: string; itemIds: string[] }[];
};

export type HarnessSnapshot = {
  schemaVersion: typeof SCHEMA_VERSION;
  exportedAt: string;
  exporter: Exporter;
  environment: Environment;
  counts: SnapshotCounts;
  skills: HarnessSkill[];
  agents: HarnessAgent[];
  mcpServers: HarnessMcpServer[];
  plugins: HarnessPlugin[];
  commands: HarnessCommand[];
  hooks: HarnessHook[];
  permissions: HarnessPermissions;
  recipes: Recipe[];
  claudeMd: { sections: string[] };
  settings: {
    model: string | null;
    effortLevel: string | null;
    envKeyNames: string[];
  };
  warnings: string[];
};

export type ParseResult =
  | { ok: true; data: HarnessSnapshot; warnings: string[] }
  | { ok: false; errors: string[] };

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function requiredObject(value: unknown, path: string, errors: string[]): JsonObject {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return {};
  }
  return value;
}

function requiredString(value: unknown, path: string, errors: string[]): string {
  if (!isString(value)) {
    errors.push(`${path} must be a string`);
    return "";
  }
  return value;
}

function nullableString(value: unknown, path: string, errors: string[], fallback: string | null = null): string | null {
  if (value === null || value === undefined) return fallback;
  if (!isString(value)) {
    errors.push(`${path} must be a string or null`);
    return fallback;
  }
  return value;
}

function stringArray(value: unknown, path: string, errors: string[], optional = false): string[] {
  if (value === undefined && optional) return [];
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  const result: string[] = [];
  value.forEach((entry, index) => {
    if (isString(entry)) result.push(entry);
    else errors.push(`${path}[${index}] must be a string`);
  });
  return result;
}

function category(value: unknown): CategoryId | null {
  return isCategoryId(value) ? value : null;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string, errors: string[]): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  errors.push(`${path} has an invalid value`);
  return allowed[0];
}

function counts(value: unknown, errors: string[], defaults?: Partial<SnapshotCounts>): SnapshotCounts {
  const source = requiredObject(value, "counts", errors);
  const read = (key: keyof SnapshotCounts): number => {
    const valueForKey = source[key];
    if (valueForKey === undefined && defaults?.[key] !== undefined) return defaults[key] as number;
    if (!isNonNegativeInteger(valueForKey)) {
      errors.push(`counts.${key} must be a non-negative integer`);
      return 0;
    }
    return valueForKey;
  };
  return {
    skills: read("skills"),
    agents: read("agents"),
    mcpServers: read("mcpServers"),
    plugins: read("plugins"),
    commands: read("commands"),
  };
}

function parseSkill(value: unknown, index: number, errors: string[]): HarnessSkill {
  const source = requiredObject(value, `skills[${index}]`, errors);
  return {
    id: requiredString(source.id, `skills[${index}].id`, errors),
    name: requiredString(source.name, `skills[${index}].name`, errors),
    description: requiredString(source.description, `skills[${index}].description`, errors),
    scope: enumValue(source.scope, ["user", "project", "plugin"], `skills[${index}].scope`, errors),
    triggers: stringArray(source.triggers, `skills[${index}].triggers`, errors, true),
    category: category(source.category),
  };
}

function parseAgent(value: unknown, index: number, errors: string[]): HarnessAgent {
  const source = requiredObject(value, `agents[${index}]`, errors);
  return {
    id: requiredString(source.id, `agents[${index}].id`, errors),
    description: requiredString(source.description, `agents[${index}].description`, errors),
    tools: stringArray(source.tools, `agents[${index}].tools`, errors, true),
    model: nullableString(source.model, `agents[${index}].model`, errors),
    category: category(source.category),
  };
}

function parseMcpServer(value: unknown, index: number, errors: string[]): HarnessMcpServer {
  const source = requiredObject(value, `mcpServers[${index}]`, errors);
  const result: HarnessMcpServer = {
    id: requiredString(source.id, `mcpServers[${index}].id`, errors),
    scope: enumValue(source.scope, ["global", "project", "connector"], `mcpServers[${index}].scope`, errors),
    transport: enumValue(source.transport, ["stdio", "http", "sse"], `mcpServers[${index}].transport`, errors),
    status: enumValue(
      source.status,
      ["connected", "needs-auth", "failed", "unknown"],
      `mcpServers[${index}].status`,
      errors,
    ),
    category: category(source.category),
  };
  if (source.commandSummary !== undefined) {
    result.commandSummary = requiredString(source.commandSummary, `mcpServers[${index}].commandSummary`, errors);
  }
  if (source.host !== undefined) {
    result.host = requiredString(source.host, `mcpServers[${index}].host`, errors);
  }
  if (typeof source.projectLabel === "string") {
    result.projectLabel = source.projectLabel;
  }
  return result;
}

function parsePlugin(value: unknown, index: number, errors: string[]): HarnessPlugin {
  const source = requiredObject(value, `plugins[${index}]`, errors);
  return {
    id: requiredString(source.id, `plugins[${index}].id`, errors),
    marketplace: requiredString(source.marketplace, `plugins[${index}].marketplace`, errors),
    version: requiredString(source.version, `plugins[${index}].version`, errors),
    enabled: typeof source.enabled === "boolean" ? source.enabled : (errors.push(`plugins[${index}].enabled must be a boolean`), false),
    installedAt: requiredString(source.installedAt, `plugins[${index}].installedAt`, errors),
  };
}

function parseCommand(value: unknown, index: number, errors: string[]): HarnessCommand {
  const source = requiredObject(value, `commands[${index}]`, errors);
  return {
    id: requiredString(source.id, `commands[${index}].id`, errors),
    scope: enumValue(source.scope, ["user", "project", "plugin"], `commands[${index}].scope`, errors),
  };
}

function parseHook(value: unknown, index: number, errors: string[]): HarnessHook {
  const source = requiredObject(value, `hooks[${index}]`, errors);
  const count = isNonNegativeInteger(source.count)
    ? source.count
    : (errors.push(`hooks[${index}].count must be a non-negative integer`), 0);
  return { event: requiredString(source.event, `hooks[${index}].event`, errors), count };
}

function parsePermissions(value: unknown, errors: string[]): HarnessPermissions {
  const source = requiredObject(value, "permissions", errors);
  const categoriesSource = requiredObject(source.categories, "permissions.categories", errors);
  const permissionCategories: Record<string, number> = {};
  for (const [key, count] of Object.entries(categoriesSource)) {
    if (isNonNegativeInteger(count)) permissionCategories[key] = count;
    else errors.push(`permissions.categories.${key} must be a non-negative integer`);
  }
  const allowCount = isNonNegativeInteger(source.allowCount)
    ? source.allowCount
    : (errors.push("permissions.allowCount must be a non-negative integer"), 0);
  return {
    defaultMode: nullableString(source.defaultMode, "permissions.defaultMode", errors),
    allowCount,
    categories: permissionCategories,
  };
}

function parseRecipeStep(value: unknown): { phase: string; itemIds: string[] } | null {
  if (!isObject(value)) return null;
  const phase = value.phase;
  if (!isString(phase) || phase.length === 0) return null;
  const itemIds = Array.isArray(value.itemIds) ? value.itemIds.filter(isString) : [];
  return { phase, itemIds };
}

function parseRecipe(value: unknown): Recipe | null {
  if (!isObject(value)) return null;
  const id = value.id;
  const title = value.title;
  if (!isString(id) || id.length === 0) return null;
  if (!isString(title) || title.length === 0) return null;
  const summary = isString(value.summary) ? value.summary : "";
  if (!Array.isArray(value.steps)) return null;
  const steps = value.steps
    .map((step) => parseRecipeStep(step))
    .filter((step): step is { phase: string; itemIds: string[] } => step !== null);
  return { id, title, summary, steps };
}

function parseRecipes(value: unknown): Recipe[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => parseRecipe(entry))
    .filter((recipe): recipe is Recipe => recipe !== null);
}

function parseV2(source: JsonObject): { data: HarnessSnapshot | null; errors: string[] } {
  const errors: string[] = [];
  const schemaVersion = source.schemaVersion;
  if (schemaVersion !== SCHEMA_VERSION) errors.push("schemaVersion must be 2");

  const exporterSource = requiredObject(source.exporter, "exporter", errors);
  const environmentSource = requiredObject(source.environment, "environment", errors);
  const claudeMdSource = requiredObject(source.claudeMd, "claudeMd", errors);
  const settingsSource = requiredObject(source.settings, "settings", errors);

  const skills = Array.isArray(source.skills)
    ? source.skills.map((entry, index) => parseSkill(entry, index, errors))
    : (errors.push("skills must be an array"), []);
  const agents = Array.isArray(source.agents)
    ? source.agents.map((entry, index) => parseAgent(entry, index, errors))
    : (errors.push("agents must be an array"), []);
  const mcpServers = Array.isArray(source.mcpServers)
    ? source.mcpServers.map((entry, index) => parseMcpServer(entry, index, errors))
    : (errors.push("mcpServers must be an array"), []);
  const plugins = Array.isArray(source.plugins)
    ? source.plugins.map((entry, index) => parsePlugin(entry, index, errors))
    : (errors.push("plugins must be an array"), []);
  const commands = Array.isArray(source.commands)
    ? source.commands.map((entry, index) => parseCommand(entry, index, errors))
    : (errors.push("commands must be an array"), []);
  const hooks = Array.isArray(source.hooks)
    ? source.hooks.map((entry, index) => parseHook(entry, index, errors))
    : (errors.push("hooks must be an array"), []);

  const countsValue = counts(source.counts, errors);
  const sections = stringArray(claudeMdSource.sections, "claudeMd.sections", errors);
  const settings: HarnessSnapshot["settings"] = {
    model: nullableString(settingsSource.model, "settings.model", errors),
    effortLevel: nullableString(settingsSource.effortLevel, "settings.effortLevel", errors),
    envKeyNames: stringArray(settingsSource.envKeyNames, "settings.envKeyNames", errors),
  };
  const data: HarnessSnapshot = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: requiredString(source.exportedAt, "exportedAt", errors),
    exporter: {
      kind: enumValue(exporterSource.kind, ["cli", "paste"], "exporter.kind", errors),
      version: requiredString(exporterSource.version, "exporter.version", errors),
      classifier: enumValue(exporterSource.classifier, ["agent", "rule", "none"], "exporter.classifier", errors),
    },
    environment: {
      os: requiredString(environmentSource.os, "environment.os", errors),
      claudeVersion: nullableString(environmentSource.claudeVersion, "environment.claudeVersion", errors),
      model: nullableString(environmentSource.model, "environment.model", errors),
      language: nullableString(environmentSource.language, "environment.language", errors),
    },
    counts: countsValue,
    skills,
    agents,
    mcpServers,
    plugins,
    commands,
    hooks,
    permissions: parsePermissions(source.permissions, errors),
    recipes: parseRecipes(source.recipes),
    claudeMd: { sections },
    settings,
    warnings: stringArray(source.warnings, "warnings", errors, true),
  };
  return { data: errors.length === 0 ? data : null, errors };
}

function migrateV1(source: JsonObject): JsonObject {
  const machine = isObject(source.machine) ? source.machine : {};
  const legacySettings = isObject(source.settings) ? source.settings : {};
  const legacyCounts = isObject(source.counts) ? source.counts : {};
  const legacySkills = Array.isArray(source.skills) ? source.skills : [];
  const legacyAgents = Array.isArray(source.agents) ? source.agents : [];
  const legacyMcpServers = Array.isArray(source.mcpServers) ? source.mcpServers : [];
  const legacyPlugins = Array.isArray(source.plugins) ? source.plugins : [];

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: source.collectedAt,
    exporter: { kind: "cli", version: "legacy", classifier: "none" },
    environment: {
      os: machine.os,
      claudeVersion: null,
      model: legacySettings.model ?? null,
      language: null,
    },
    counts: {
      skills: legacyCounts.skills,
      agents: legacyCounts.agents,
      mcpServers: legacyCounts.mcpServers,
      plugins: legacyCounts.plugins,
      commands: 0,
    },
    skills: legacySkills.map((entry) => {
      const item = isObject(entry) ? entry : {};
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        scope: "user",
        triggers: item.triggers ?? [],
        category: null,
      };
    }),
    agents: legacyAgents.map((entry) => {
      const item = isObject(entry) ? entry : {};
      return {
        id: item.id,
        description: item.description,
        tools: item.tools ?? [],
        model: item.model ?? null,
        category: null,
      };
    }),
    mcpServers: legacyMcpServers.map((entry) => {
      const item = isObject(entry) ? entry : {};
      return {
        id: item.id,
        scope: item.scope,
        transport: item.transport,
        ...(item.commandSummary === undefined ? {} : { commandSummary: item.commandSummary }),
        ...(item.host === undefined ? {} : { host: item.host }),
        status: "unknown",
        category: null,
      };
    }),
    plugins: legacyPlugins.map((entry) => {
      const item = isObject(entry) ? entry : {};
      return {
        id: item.id,
        marketplace: item.marketplace,
        version: item.version,
        enabled: true,
        installedAt: item.installedAt ?? "",
      };
    }),
    commands: [],
    hooks: source.hooks ?? [],
    permissions: {
      defaultMode: null,
      ...(isObject(source.permissions) ? source.permissions : {}),
    },
    claudeMd: source.claudeMd ?? { sections: [] },
    settings: {
      model: legacySettings.model ?? null,
      effortLevel: null,
      envKeyNames: legacySettings.envKeyNames ?? [],
    },
    warnings: ["schemaVersion 1からv2へ移行しました（machineをenvironmentへ変換）"],
  };
}

export function parseSnapshot(input: unknown): ParseResult {
  if (!isObject(input) || Object.keys(input).length === 0) {
    return { ok: false, errors: ["snapshot must be a non-empty object"] };
  }

  if (input.schemaVersion === 1) {
    const migrated = migrateV1(input);
    const result = parseV2(migrated);
    if (!result.data) return { ok: false, errors: result.errors };
    return { ok: true, data: result.data, warnings: result.data.warnings };
  }

  if (input.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, errors: ["schemaVersion must be 1 or 2"] };
  }

  const result = parseV2(input);
  if (!result.data) return { ok: false, errors: result.errors };
  return { ok: true, data: result.data, warnings: result.data.warnings };
}
