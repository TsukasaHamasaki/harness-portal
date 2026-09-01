import type { HarnessSnapshot } from "./schema";
import type { Lang } from "../../../shared/i18n.mjs";

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
  lang?: Lang;
};

const HISTORY_TEXT = {
  ja: {
    httpError: (operation: string, status: number) => `${operation}: ローカル履歴APIがHTTP ${status}を返しました。`,
    badList: "ローカル履歴APIが不正なスナップショット一覧を返しました。",
    noFetch: "ローカル履歴APIを利用できるfetchがありません。",
    badArray: "ローカル履歴APIが不正な一覧を返しました。",
    badSnapshot: "ローカル履歴APIが不正なスナップショットを返しました。",
    opList: "履歴一覧の取得",
    opLoad: "スナップショットの取得",
    opDelete: "スナップショットの削除",
  },
  en: {
    httpError: (operation: string, status: number) => `${operation}: the local history API returned HTTP ${status}.`,
    badList: "The local history API returned an invalid snapshot list.",
    noFetch: "No fetch implementation is available for the local history API.",
    badArray: "The local history API returned an invalid list.",
    badSnapshot: "The local history API returned an invalid snapshot.",
    opList: "Listing history",
    opLoad: "Loading snapshot",
    opDelete: "Deleting snapshot",
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type HistoryText = (typeof HISTORY_TEXT)[Lang];

function apiError(operation: string, response: Response, text: HistoryText): Error {
  return new Error(text.httpError(operation, response.status));
}

function assertApiResponse(response: Response, operation: string, text: HistoryText): void {
  if (response.ok === false || (typeof response.status === "number" && response.status >= 400)) {
    throw apiError(operation, response, text);
  }
}

function remoteMeta(value: unknown, text: HistoryText): SnapshotMeta {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.exportedAt !== "string") {
    throw new Error(text.badList);
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
  const text = HISTORY_TEXT[options.lang ?? "ja"];

  function requireFetch(): typeof fetch {
    if (!fetchImpl) throw new Error(text.noFetch);
    return fetchImpl;
  }

  const listSnapshots = async (): Promise<SnapshotMeta[]> => {
    const response = await requireFetch()(`${apiBase}/snapshots`);
    assertApiResponse(response, text.opList, text);
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new Error(text.badArray);
    return body.map((entry) => remoteMeta(entry, text)).sort((a, b) => b.exportedAt.localeCompare(a.exportedAt));
  };

  const loadSnapshot = async (fileId: string): Promise<HarnessSnapshot> => {
    const response = await requireFetch()(`${apiBase}/snapshots/${encodeURIComponent(fileId)}`);
    assertApiResponse(response, text.opLoad, text);
    const body: unknown = await response.json();
    if (!isRecord(body)) throw new Error(text.badSnapshot);
    return body as unknown as HarnessSnapshot;
  };

  const deleteSnapshot = async (fileId: string): Promise<void> => {
    const response = await requireFetch()(`${apiBase}/snapshots/${encodeURIComponent(fileId)}`, { method: "DELETE" });
    assertApiResponse(response, text.opDelete, text);
  };

  return { kind: "local", listSnapshots, loadSnapshot, deleteSnapshot };
}

export const createLocalApiHistoryStore = createLocalHistoryStore;
