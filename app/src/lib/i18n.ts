import { createContext, useContext } from "react";
import type { Lang } from "../../../shared/i18n.mjs";
import { normalizeLang } from "../../../shared/i18n.mjs";

export type { Lang };

export const LANG_STORAGE_KEY = "harness-portal.lang";

/** ブラウザに記憶した言語。無ければ null */
export function readStoredLang(): Lang | null {
  try {
    return normalizeLang(window.localStorage.getItem(LANG_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // 記憶できなくても表示は切り替わる
  }
}

const MESSAGES = {
  ja: {
    // topbar / app
    brandHomeAria: "Harness Portal ホーム",
    modeLocal: "ローカルモード",
    modeUnavailable: "スナップショットなし",
    modeChecking: "接続を確認中",
    langSwitchAria: "表示言語",
    introKicker: "YOUR AGENT HARNESS",
    introTitle: "能力の現在地",
    introLead: "いまの環境にあるツール、知識、連携をひとつの地図にまとめています。",
    introUpdated: (date: string) => `更新 ${date}`,
    tabMap: "マップ",
    tabFlow: "フロー",
    tabInventory: "インベントリ",
    tabHistory: "履歴",
    tabsAria: "表示切り替え",
    noticeTitle: "取り込み時の注意",
    secretTitle: "秘密情報の可能性を検出しました",
    secretBody: (paths: string) => `表示・保存前に自動マスクしました。該当パス: ${paths}`,
    loadErrorTitle: "スナップショットを読み込めませんでした",
    loading: "ローカルスナップショットを確認しています…",
    unavailableTitle: "スナップショットがありません",
    unavailableBodyBefore: "この画面は ",
    unavailableBodyMiddle: " が立てたローカルサーバー上でだけ動きます。ターミナルで実行し直すと、表示された ",
    unavailableBodyAfter: " が開きます。",
    footerBrand: "HARNESS PORTAL / PRIVATE BY DESIGN",
    footerNote: "履歴はこの端末（~/.harness）にのみ保存されます。外部には送信されません。",
    loadFailed: "スナップショットの読み込みに失敗しました。",
    compareLoadFailed: "比較対象のスナップショットを読み込めませんでした。",
    // summary cards
    summaryAria: "スナップショット概要",
    summaryCapabilities: "検出した能力",
    summaryCapabilitiesNote: "5種類のリソースを横断",
    summaryHooks: "Hooks",
    summaryHooksNone: "設定なし",
    summaryPermissions: "Permissions",
    summaryPermissionsNote: "許可済みの操作",
    summaryLoadedAt: "読み込み日時",
    summaryClassifier: (os: string, classifier: string) => `${os} / ${classifier} 分類`,
    countUnit: "件",
    // chips
    chipsKicker: "CAPABILITY CHIPS",
    chipsTitle: "何ができる状態か",
    chipsLead: "名前・要約・トリガー例文から検索できます。",
    searchAria: "能力を検索",
    searchPlaceholder: "名前・要約・トリガー例文で検索…",
    legendAria: "能力の種別凡例",
    chipAria: (title: string, kind: string, category: string) => `${title}（${kind}・${category}）`,
    chipAriaDuplicated: (title: string, kind: string, category: string, n: number) => `${title}（${kind}・${category}・${n}プロジェクトに登録）`,
    noDescription: "説明なし",
    // detail dialog
    closeDetail: "詳細を閉じる",
    fallbackNotice: "この項目は自動分類できなかったため「その他」に置いています。",
    triggersHeading: "こう話しかける",
    detailHeading: "元の説明（全文）",
    // findings
    findingsAria: "気づき",
    findingsHeading: "気づき",
    // recipe flow
    noTool: "手段なし",
    skillPromptButton: "skill化プロンプト",
    recipesEmpty: "フローは npx harness-portal（--no-agent なし）で生成されます",
    // export
    exportHtml: "HTMLで保存",
    exportPdf: "PDFで保存",
    exportSkillZip: "skill化プロンプト一括",
    exportNote: "ブラウザの印刷画面から PDF として保存します",
    exportTitleMap: "ハーネス マップ",
    exportTitleFlow: "ハーネス フロー",
    // inventory
    inventoryKicker: "INVENTORY",
    inventoryTitle: "構成要素の一覧",
    inventoryLead: "収集されたリソースと実行環境の設定を、カテゴリ別に確認できます。",
    inventoryMcp: "MCPサーバー",
    inventoryMcpEmpty: "MCPサーバーはありません。",
    inventoryEmpty: "設定されている項目はありません。",
    inventoryHooksNote: "イベント実行回数",
    inventoryHooksEmpty: "hooksはありません。",
    inventorySettings: "設定",
    inventoryModel: "モデル",
    inventoryEnvKeys: "環境変数キー",
    inventoryEnvKeysValue: (n: number) => `${n}件（値は非表示）`,
    inventoryNotFetched: "未取得",
    inventoryUnset: "未設定",
    inventorySectionsEmpty: "セクションはありません。",
    inventoryPermissions: "許可カテゴリ",
    inventoryPermissionsEmpty: "許可カテゴリはありません。",
    statusConnected: "接続済み",
    statusNeedsAuth: "要認証",
    statusFailed: "失敗",
    statusUnknown: "不明",
    // history
    historyKicker: "HISTORY",
    historyTitle: "履歴と差分",
    historyLead: "2件を選ぶと、能力の追加・削除・変更を比較できます。",
    historyRefresh: "↻ 履歴を更新",
    historyRefreshing: "更新中…",
    historyEmptyTitle: "保存されたスナップショットはありません",
    historyEmptyBody: "現在の状態を保存すると、ここから履歴を比較できます。",
    historySelected: (n: number) => `${n}/2件を選択`,
    historyCompare: "選択した2件を比較",
    historyComparing: "比較中…",
    historyUntitled: "無題のスナップショット",
    historyDeleteAria: (label: string) => `${label}を削除`,
    historyDeleteConfirm: "このスナップショットを削除しますか？",
    historyStoreError: "履歴ストアとの通信に失敗しました。",
    diffKicker: "COMPARISON",
    diffTitle: "スナップショットの差分",
    diffUnchanged: (n: number) => `不変 ${n}件`,
    diffAdded: "追加",
    diffRemoved: "削除",
    diffChanged: "変更",
    diffNone: "なし",
    diffFieldsSeparator: "・",
  },
  en: {
    brandHomeAria: "Harness Portal home",
    modeLocal: "Local mode",
    modeUnavailable: "No snapshot",
    modeChecking: "Checking connection",
    langSwitchAria: "Display language",
    introKicker: "YOUR AGENT HARNESS",
    introTitle: "Where your capabilities stand",
    introLead: "Every tool, skill, and integration in this environment, on one map.",
    introUpdated: (date: string) => `Updated ${date}`,
    tabMap: "Map",
    tabFlow: "Flows",
    tabInventory: "Inventory",
    tabHistory: "History",
    tabsAria: "Switch view",
    noticeTitle: "Notes from collection",
    secretTitle: "Possible secrets detected",
    secretBody: (paths: string) => `Masked automatically before display and save. Paths: ${paths}`,
    loadErrorTitle: "Could not load the snapshot",
    loading: "Checking for a local snapshot…",
    unavailableTitle: "No snapshot available",
    unavailableBodyBefore: "This page only works on the local server started by ",
    unavailableBodyMiddle: ". Run it again in a terminal and open the ",
    unavailableBodyAfter: " it prints.",
    footerBrand: "HARNESS PORTAL / PRIVATE BY DESIGN",
    footerNote: "History is stored only on this machine (~/.harness). Nothing is sent anywhere.",
    loadFailed: "Failed to load the snapshot.",
    compareLoadFailed: "Could not load the snapshots to compare.",
    summaryAria: "Snapshot summary",
    summaryCapabilities: "Capabilities found",
    summaryCapabilitiesNote: "Across 5 resource types",
    summaryHooks: "Hooks",
    summaryHooksNone: "None configured",
    summaryPermissions: "Permissions",
    summaryPermissionsNote: "Allowed operations",
    summaryLoadedAt: "Loaded at",
    summaryClassifier: (os: string, classifier: string) => `${os} / classified by ${classifier}`,
    countUnit: "",
    chipsKicker: "CAPABILITY CHIPS",
    chipsTitle: "What you can do right now",
    chipsLead: "Search by name, summary, or trigger phrase.",
    searchAria: "Search capabilities",
    searchPlaceholder: "Search name, summary, or trigger phrase…",
    legendAria: "Capability kinds",
    chipAria: (title: string, kind: string, category: string) => `${title} (${kind}, ${category})`,
    chipAriaDuplicated: (title: string, kind: string, category: string, n: number) => `${title} (${kind}, ${category}, registered in ${n} projects)`,
    noDescription: "No description",
    closeDetail: "Close details",
    fallbackNotice: "This item could not be classified automatically, so it is filed under “Other”.",
    triggersHeading: "Say this to use it",
    detailHeading: "Original description (full)",
    findingsAria: "Findings",
    findingsHeading: "Findings",
    noTool: "No tool available",
    skillPromptButton: "Skill prompt",
    recipesEmpty: "Flows are generated by npx harness-portal (without --no-agent)",
    exportHtml: "Save as HTML",
    exportPdf: "Save as PDF",
    exportSkillZip: "All skill prompts (ZIP)",
    exportNote: "Uses your browser's print dialog to save a PDF",
    exportTitleMap: "Harness Map",
    exportTitleFlow: "Harness Flows",
    inventoryKicker: "INVENTORY",
    inventoryTitle: "Everything that was collected",
    inventoryLead: "Collected resources and runtime settings, grouped by category.",
    inventoryMcp: "MCP servers",
    inventoryMcpEmpty: "No MCP servers.",
    inventoryEmpty: "Nothing configured.",
    inventoryHooksNote: "Configured handlers",
    inventoryHooksEmpty: "No hooks.",
    inventorySettings: "Settings",
    inventoryModel: "Model",
    inventoryEnvKeys: "Env var keys",
    inventoryEnvKeysValue: (n: number) => `${n} (values hidden)`,
    inventoryNotFetched: "Not available",
    inventoryUnset: "Not set",
    inventorySectionsEmpty: "No sections.",
    inventoryPermissions: "Allowed categories",
    inventoryPermissionsEmpty: "No allowed categories.",
    statusConnected: "Connected",
    statusNeedsAuth: "Needs auth",
    statusFailed: "Failed",
    statusUnknown: "Unknown",
    historyKicker: "HISTORY",
    historyTitle: "History and diff",
    historyLead: "Pick two snapshots to compare added, removed, and changed capabilities.",
    historyRefresh: "↻ Refresh history",
    historyRefreshing: "Refreshing…",
    historyEmptyTitle: "No saved snapshots",
    historyEmptyBody: "Once a run is saved, you can compare it here.",
    historySelected: (n: number) => `${n}/2 selected`,
    historyCompare: "Compare selected",
    historyComparing: "Comparing…",
    historyUntitled: "Untitled snapshot",
    historyDeleteAria: (label: string) => `Delete ${label}`,
    historyDeleteConfirm: "Delete this snapshot?",
    historyStoreError: "Could not reach the history store.",
    diffKicker: "COMPARISON",
    diffTitle: "Snapshot diff",
    diffUnchanged: (n: number) => `${n} unchanged`,
    diffAdded: "Added",
    diffRemoved: "Removed",
    diffChanged: "Changed",
    diffNone: "None",
    diffFieldsSeparator: ", ",
  },
} as const;

type Messages = typeof MESSAGES.ja;
export type MessageKey = keyof Messages;

export const LangContext = createContext<Lang>("ja");

export function useLang(): Lang {
  return useContext(LangContext);
}

/** 文言を返す。関数エントリは引数を適用する */
export function translate<K extends MessageKey>(
  lang: Lang,
  key: K,
  ...args: Messages[K] extends (...params: infer P) => string ? P : []
): string {
  const entry = (MESSAGES[lang] as Messages)[key] as unknown;
  if (typeof entry === "function") return (entry as (...params: unknown[]) => string)(...args);
  return entry as string;
}

export type TArgs<K extends MessageKey> = Messages[K] extends (...params: infer P) => string ? P : [];

/** 言語を固定した t 関数を作る（React の外でも使える） */
export function makeT(lang: Lang) {
  return <K extends MessageKey>(key: K, ...args: TArgs<K>): string => translate(lang, key, ...args);
}

export function useT() {
  return makeT(useLang());
}

export function dateLocale(lang: Lang): string {
  return lang === "ja" ? "ja-JP" : "en-US";
}

export function formatDateTime(value: string, lang: Lang): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(dateLocale(lang));
}

export function formatDate(value: string, lang: Lang): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(dateLocale(lang));
}

/** 「12件」「12」のように、言語ごとの件数表記 */
export function countLabel(n: number, lang: Lang): string {
  return lang === "ja" ? `${n}件` : String(n);
}
