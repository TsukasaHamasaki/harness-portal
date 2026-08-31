import { buildCapabilityMap } from "./capabilities";
import type { CapabilityItem } from "./capabilities";
import type { HarnessSnapshot } from "./schema";

export type SnapshotDiff = {
  added: CapabilityItem[];
  removed: CapabilityItem[];
  changed: { before: CapabilityItem; after: CapabilityItem; fields: string[] }[];
  unchangedCount: number;
};

function flatten(snapshot: HarnessSnapshot): CapabilityItem[] {
  return buildCapabilityMap(snapshot).flatMap((category) => category.items);
}

function byId(items: CapabilityItem[]): Map<string, CapabilityItem> {
  return new Map(items.map((item) => [item.id, item]));
}

export function diffSnapshots(before: HarnessSnapshot, after: HarnessSnapshot): SnapshotDiff {
  const beforeById = byId(flatten(before));
  const afterById = byId(flatten(after));
  const added: CapabilityItem[] = [];
  const removed: CapabilityItem[] = [];
  const changed: SnapshotDiff["changed"] = [];
  let unchangedCount = 0;

  for (const afterItem of afterById.values()) {
    const beforeItem = beforeById.get(afterItem.id);
    if (!beforeItem) {
      added.push(afterItem);
      continue;
    }
    const fields = (["summary", "detail", "categoryId"] as const).filter(
      (field) => beforeItem[field] !== afterItem[field],
    );
    if (fields.length > 0) changed.push({ before: beforeItem, after: afterItem, fields: [...fields] });
    else unchangedCount += 1;
  }

  for (const beforeItem of beforeById.values()) {
    if (!afterById.has(beforeItem.id)) removed.push(beforeItem);
  }

  return { added, removed, changed, unchangedCount };
}
