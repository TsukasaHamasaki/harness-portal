export type CapabilityKind = "skill" | "agent" | "mcp" | "plugin" | "command";

export const KIND_COLORS = {
  skill: "#0072B2",
  mcp: "#D55E00",
  agent: "#009E73",
  plugin: "#CC79A7",
  command: "#E69F00",
} as const;

export const KIND_LABELS_JA = {
  skill: "スキル",
  mcp: "MCP",
  agent: "エージェント",
  plugin: "プラグイン",
  command: "コマンド",
} as const;
