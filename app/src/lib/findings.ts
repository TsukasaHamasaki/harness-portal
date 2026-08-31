import type { HarnessSnapshot } from "./schema";

export type FindingEntry = { label: string; detail: string };

export type HarnessFinding = {
  id: string;
  kind: "divergent" | "redundant";
  title: string;
  question: string;
  entries: FindingEntry[];
};

export function findHarnessFindings(s: HarnessSnapshot): HarnessFinding[] {
  const groups = new Map<string, HarnessSnapshot["mcpServers"]>();
  for (const entry of s.mcpServers) {
    const group = groups.get(entry.id);
    if (group) group.push(entry);
    else groups.set(entry.id, [entry]);
  }

  const divergent: { mcpId: string; finding: HarnessFinding }[] = [];
  const redundant: { mcpId: string; finding: HarnessFinding }[] = [];

  for (const [mcpId, group] of groups) {
    const n = group.length;
    if (n < 2) continue;

    const fingerprints = group.map((e) => `${e.transport}|${e.commandSummary ?? ""}|${e.host ?? ""}`);
    const isRedundant = fingerprints.every((fp) => fp === fingerprints[0]);

    const entries: FindingEntry[] = group.map((e) => ({
      label: typeof e.projectLabel === "string" && e.projectLabel.length > 0 ? e.projectLabel : e.scope,
      detail: e.commandSummary ?? e.host ?? e.transport,
    }));

    if (isRedundant) {
      redundant.push({
        mcpId,
        finding: {
          id: `mcp-redundant:${mcpId}`,
          kind: "redundant",
          title: `${mcpId} が${n}つのプロジェクトに同じ設定で登録されています`,
          question: "意図的ですか？ global スコープにまとめると1つで済みます。",
          entries,
        },
      });
    } else {
      divergent.push({
        mcpId,
        finding: {
          id: `mcp-divergent:${mcpId}`,
          kind: "divergent",
          title: `${mcpId} が${n}箇所で別々の設定になっています`,
          question: "意図的ですか？ 同じ名前で中身が違うと、どちらが使われるか分かりにくくなります。",
          entries,
        },
      });
    }
  }

  const byMcpId = (a: { mcpId: string }, b: { mcpId: string }) => a.mcpId.localeCompare(b.mcpId, "ja");

  divergent.sort(byMcpId);
  redundant.sort(byMcpId);

  return [...divergent.map((d) => d.finding), ...redundant.map((r) => r.finding)];
}
