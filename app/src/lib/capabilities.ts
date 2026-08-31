import { CATEGORIES, classifyByRule, isCategoryId } from "../../../shared/categories.mjs";
import type { CategoryId } from "../../../shared/categories.mjs";
import type {
  HarnessAgent,
  HarnessCommand,
  HarnessMcpServer,
  HarnessPlugin,
  HarnessSkill,
  HarnessSnapshot,
} from "./schema";

export type CapabilityItem = {
  id: string;
  kind: "skill" | "agent" | "mcp" | "plugin" | "command";
  title: string;
  summary: string;
  emoji: string;
  categoryId: CategoryId;
  source: "agent" | "rule" | "fallback";
  triggers: string[];
  detail: string;
  /** 同一 id が何回スナップショットに現れたか。プロジェクト別に登録された同じ MCP サーバーは 2 以上になる */
  occurrences: number;
};

type CapabilityCategory = {
  id: CategoryId;
  label: string;
  emoji: string;
  order: number;
  items: CapabilityItem[];
};

const KIND_EMOJI: Record<CapabilityItem["kind"], string> = {
  skill: "🧩",
  agent: "🤖",
  mcp: "🔌",
  plugin: "🧷",
  command: "⌘",
};

function firstSentence(value: string): string {
  const japaneseEnd = value.indexOf("。");
  if (japaneseEnd === -1) return value;
  return value.slice(0, japaneseEnd + 1);
}

function safeText(value: string | undefined): string {
  return typeof value === "string" ? value : "";
}

function capabilityId(kind: CapabilityItem["kind"], id: string): string {
  const prefix = `${kind}:`;
  return id.startsWith(prefix) ? id : `${prefix}${id}`;
}

function makeItem(
  kind: CapabilityItem["kind"],
  id: string,
  title: string,
  description: string,
  snapshotCategory: unknown,
  triggers: string[] = [],
  detail = description,
): CapabilityItem {
  const agentCategory = isCategoryId(snapshotCategory) ? snapshotCategory : null;
  const ruleCategory = agentCategory === null ? classifyByRule(title, description) : null;
  const categoryId = agentCategory ?? ruleCategory ?? "other";
  const source: CapabilityItem["source"] = agentCategory
    ? "agent"
    : ruleCategory
      ? "rule"
      : "fallback";
  return {
    id,
    kind,
    title,
    summary: firstSentence(description),
    emoji: KIND_EMOJI[kind],
    categoryId,
    source,
    triggers: Array.isArray(triggers) ? triggers.filter((trigger): trigger is string => typeof trigger === "string") : [],
    detail,
    occurrences: 1,
  };
}

function skillItem(skill: HarnessSkill): CapabilityItem {
  return makeItem("skill", capabilityId("skill", skill.id), skill.name, safeText(skill.description), skill.category, skill.triggers, skill.description);
}

function agentItem(agent: HarnessAgent): CapabilityItem {
  return makeItem("agent", capabilityId("agent", agent.id), agent.id, safeText(agent.description), agent.category, [], agent.description);
}

function mcpItem(server: HarnessMcpServer): CapabilityItem {
  const detail = [
    `scope: ${server.scope}`,
    `transport: ${server.transport}`,
    server.commandSummary ? `command: ${server.commandSummary}` : null,
    server.host ? `host: ${server.host}` : null,
    `status: ${server.status}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" / ");
  return makeItem("mcp", capabilityId("mcp", server.id), server.id, detail, server.category, [], detail);
}

function pluginItem(plugin: HarnessPlugin): CapabilityItem {
  const detail = `marketplace: ${plugin.marketplace} / version: ${plugin.version} / enabled: ${plugin.enabled} / installedAt: ${plugin.installedAt}`;
  return makeItem("plugin", capabilityId("plugin", plugin.id), plugin.id, detail, null, [], detail);
}

function commandItem(command: HarnessCommand): CapabilityItem {
  const detail = `scope: ${command.scope}`;
  return makeItem("command", capabilityId("command", command.id), command.id, detail, null, [], detail);
}

// 同じ MCP サーバーが複数プロジェクトに登録されていると同一 id が複数回現れる。
// 「何ができるか」の観点では 1 つの能力なので 1 件にまとめ、登場回数だけ残す。
function dedupeById(items: CapabilityItem[]): CapabilityItem[] {
  const merged = new Map<string, CapabilityItem>();
  for (const item of items) {
    const existing = merged.get(item.id);
    if (existing) existing.occurrences += 1;
    else merged.set(item.id, { ...item, occurrences: 1 });
  }
  return [...merged.values()];
}

export function buildCapabilityMap(s: HarnessSnapshot): CapabilityCategory[] {
  const items = dedupeById([
    ...s.skills.map(skillItem),
    ...s.agents.map(agentItem),
    ...s.mcpServers.map(mcpItem),
    ...s.plugins.map(pluginItem),
    ...s.commands.map(commandItem),
  ]);

  return (CATEGORIES as ReadonlyArray<{ id: CategoryId; label: string; emoji: string; order: number }>).map((category) => ({
    id: category.id,
    label: category.label,
    emoji: category.emoji,
    order: category.order,
    items: items.filter((item) => item.categoryId === category.id),
  }));
}

/** step.itemIds を itemMap で解決する。未解決 id は落とす。戻り値が空配列なら「手段なし」 */
export function resolveStepTools(
  itemIds: string[],
  itemMap: Map<string, CapabilityItem>,
): CapabilityItem[] {
  const resolved: CapabilityItem[] = [];
  for (const id of itemIds) {
    const item = itemMap.get(id);
    if (item !== undefined) resolved.push(item);
  }
  return resolved;
}
