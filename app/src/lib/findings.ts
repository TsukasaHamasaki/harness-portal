import type { HarnessSnapshot } from "./schema";
import type { Lang } from "../../../shared/i18n.mjs";

export type FindingEntry = { label: string; detail: string };

export type HarnessFinding = {
  id: string;
  kind: "divergent" | "redundant";
  title: string;
  question: string;
  entries: FindingEntry[];
};

const FINDING_TEXT = {
  ja: {
    redundantTitle: (id: string, n: number) => `${id} が${n}つのプロジェクトに同じ設定で登録されています`,
    redundantQuestion: "意図的ですか？ global スコープにまとめると1つで済みます。",
    divergentTitle: (id: string, n: number) => `${id} が${n}箇所で別々の設定になっています`,
    divergentQuestion: "意図的ですか？ 同じ名前で中身が違うと、どちらが使われるか分かりにくくなります。",
  },
  en: {
    redundantTitle: (id: string, n: number) => `${id} is registered with the same config in ${n} projects`,
    redundantQuestion: "Is that intentional? One entry in the global scope would cover them all.",
    divergentTitle: (id: string, n: number) => `${id} has ${n} different configurations`,
    divergentQuestion: "Is that intentional? Same name with different contents makes it hard to tell which one runs.",
  },
} as const;

export function findHarnessFindings(s: HarnessSnapshot, lang: Lang = "ja"): HarnessFinding[] {
  const text = FINDING_TEXT[lang];
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
          title: text.redundantTitle(mcpId, n),
          question: text.redundantQuestion,
          entries,
        },
      });
    } else {
      divergent.push({
        mcpId,
        finding: {
          id: `mcp-divergent:${mcpId}`,
          kind: "divergent",
          title: text.divergentTitle(mcpId, n),
          question: text.divergentQuestion,
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
