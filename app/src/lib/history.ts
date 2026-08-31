import type { HarnessSnapshot } from "./schema";

export type SnapshotMeta = {
  fileId: string;
  label: string;
  exportedAt: string;
  createdTime: string;
  counts: Record<string, number>;
};

export type HistoryStoreKind = "local";

export type HistoryStore = {
  readonly kind: HistoryStoreKind;
  listSnapshots: () => Promise<SnapshotMeta[]>;
  loadSnapshot: (fileId: string) => Promise<HarnessSnapshot>;
  deleteSnapshot: (fileId: string) => Promise<void>;
};

export type LocalHistoryStore = HistoryStore & {
  readonly kind: "local";
};

export type LocalHistoryStoreOptions = {
  fetchImpl?: typeof fetch;
  apiBase?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function apiError(operation: string, response: Response): Error {
  return new Error(`${operation}: ローカル履歴APIがHTTP ${response.status}を返しました。`);
}

function assertApiResponse(response: Response, operation: string): void {
  if (response.ok === false || (typeof response.status === "number" && response.status >= 400)) {
    throw apiError(operation, response);
  }
}

function remoteMeta(value: unknown): SnapshotMeta {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.exportedAt !== "string") {
    throw new Error("ローカル履歴APIが不正なスナップショット一覧を返しました。");
  }

  const counts: Record<string, number> = {};
  if (isRecord(value.counts)) {
    for (const [key, count] of Object.entries(value.counts)) {
      if (typeof count === "number" && Number.isFinite(count)) counts[key] = count;
    }
  }

  return {
    fileId: value.id,
    label: typeof value.label === "string" ? value.label : value.exportedAt,
    exportedAt: value.exportedAt,
    createdTime: typeof value.createdTime === "string" ? value.createdTime : value.exportedAt,
    counts,
  };
}

export function createLocalHistoryStore(options: LocalHistoryStoreOptions = {}): LocalHistoryStore {
  const fetchImpl = options.fetchImpl ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
  const apiBase = (options.apiBase ?? "/api").replace(/\/$/, "");

  function requireFetch(): typeof fetch {
    if (!fetchImpl) throw new Error("ローカル履歴APIを利用できるfetchがありません。");
    return fetchImpl;
  }

  const listSnapshots = async (): Promise<SnapshotMeta[]> => {
    const response = await requireFetch()(`${apiBase}/snapshots`);
    assertApiResponse(response, "履歴一覧の取得");
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new Error("ローカル履歴APIが不正な一覧を返しました。");
    return body.map(remoteMeta).sort((a, b) => b.exportedAt.localeCompare(a.exportedAt));
  };

  const loadSnapshot = async (fileId: string): Promise<HarnessSnapshot> => {
    const response = await requireFetch()(`${apiBase}/snapshots/${encodeURIComponent(fileId)}`);
    assertApiResponse(response, "スナップショットの取得");
    const body: unknown = await response.json();
    if (!isRecord(body)) throw new Error("ローカル履歴APIが不正なスナップショットを返しました。");
    return body as unknown as HarnessSnapshot;
  };

  const deleteSnapshot = async (fileId: string): Promise<void> => {
    const response = await requireFetch()(`${apiBase}/snapshots/${encodeURIComponent(fileId)}`, { method: "DELETE" });
    assertApiResponse(response, "スナップショットの削除");
  };

  return { kind: "local", listSnapshots, loadSnapshot, deleteSnapshot };
}

export const createLocalApiHistoryStore = createLocalHistoryStore;
