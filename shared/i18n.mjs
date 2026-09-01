// CLI と SPA の両方が使う言語判定と、CLI 側の文言辞書。
// UI の文言は app/src/lib/i18n.ts にある（React に依存するため分けている）。

export const SUPPORTED_LANGS = ["ja", "en"];

/** "ja" | "en" 以外は null */
export function normalizeLang(value) {
  if (typeof value !== "string") return null;
  const lower = value.trim().toLowerCase();
  if (lower === "ja" || lower.startsWith("ja-") || lower.startsWith("ja_")) return "ja";
  if (lower === "en" || lower.startsWith("en-") || lower.startsWith("en_")) return "en";
  return null;
}

/**
 * CLI の既定言語。OS のロケールが日本語なら ja、それ以外は en。
 * 環境変数（LC_ALL > LC_MESSAGES > LANG）を先に見て、無ければ Intl のロケール（Windows でも取れる）を使う。
 */
export function detectLang({ env = process.env, intlLocale } = {}) {
  for (const key of ["LC_ALL", "LC_MESSAGES", "LANG"]) {
    const value = env[key];
    if (typeof value === "string" && value.trim() !== "" && value !== "C" && value !== "POSIX") {
      return normalizeLang(value) ?? "en";
    }
  }
  const locale = intlLocale ?? (() => {
    try {
      return new Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      return "";
    }
  })();
  return normalizeLang(locale) ?? "en";
}

const CLI_MESSAGES = {
  ja: {
    scanning: (dir) => `▸ 走査中 ${dir}`,
    collected: (c) => `▸ 収集完了 スキル${c.skills ?? 0} / MCP${c.mcpServers ?? 0} / エージェント${c.agents ?? 0} / プラグイン${c.plugins ?? 0}`,
    classifyingRule: (n) => `▸ 分類中 ${n}項目（規則ベース）`,
    classifyingAgent: (n) => `▸ 分類中 ${n}項目 — Claudeに問い合わせています（1分ほどかかります）`,
    elapsed: (sec) => `  経過 ${sec}秒`,
    classifiedAgent: "▸ 分類完了 Claudeが付与",
    classifiedRule: "▸ 分類完了 規則ベース",
    recipesStart: "▸ フロー生成中 …",
    recipesSkipped: "▸ フロー生成 スキップ",
    recipesDone: (n) => `▸ フロー生成完了 ${n}件`,
    saved: (id) => `▸ 保存 ${id}`,
    saveSkipped: "▸ 保存 スキップ",
    portFallback: (from, to) => `▸ ポート ${from} は使用中のため ${to} を使います`,
    portInUse: (port) => `ポート ${port} は既に使われています。別のポートを --port で指定するか、使用中のプロセスを止めてください。`,
    portRangeInUse: (from, to) => `ポート ${from} から ${to} まで全て使われています。--port で空きポートを指定してください。`,
    agentTimeout: "Claude からの応答がタイムアウトしました。ネットワークを確認して再実行してください。",
    agentNotLoggedIn: "Claude Code にログインしていません。ターミナルで `claude` を起動して /login を済ませてから、もう一度実行してください。",
    agentSdkMissing: "Claude Agent SDK を読み込めませんでした。`npx harness-portal@latest` で再取得してください。",
    agentFailed: (detail) => (detail ? `Claude への問い合わせに失敗しました: ${detail}` : "Claude への問い合わせに失敗しました。"),
    recipeLanguage: "Write every title, summary, and phase name in Japanese.",
  },
  en: {
    scanning: (dir) => `▸ Scanning ${dir}`,
    collected: (c) => `▸ Collected skills ${c.skills ?? 0} / MCP ${c.mcpServers ?? 0} / agents ${c.agents ?? 0} / plugins ${c.plugins ?? 0}`,
    classifyingRule: (n) => `▸ Classifying ${n} items (keyword rules)`,
    classifyingAgent: (n) => `▸ Classifying ${n} items — asking Claude (about a minute)`,
    elapsed: (sec) => `  ${sec}s elapsed`,
    classifiedAgent: "▸ Classified by Claude",
    classifiedRule: "▸ Classified by keyword rules",
    recipesStart: "▸ Generating flows …",
    recipesSkipped: "▸ Flows skipped",
    recipesDone: (n) => `▸ Generated ${n} flows`,
    saved: (id) => `▸ Saved ${id}`,
    saveSkipped: "▸ Save skipped",
    portFallback: (from, to) => `▸ Port ${from} is in use; using ${to}`,
    portInUse: (port) => `Port ${port} is already in use. Pass a different --port or stop the process using it.`,
    portRangeInUse: (from, to) => `Ports ${from} through ${to} are all in use. Pass a free port with --port.`,
    agentTimeout: "Claude did not respond in time. Check your network and try again.",
    agentNotLoggedIn: "Claude Code is not logged in. Run `claude`, complete /login, then try again.",
    agentSdkMissing: "Could not load the Claude Agent SDK. Re-run with `npx harness-portal@latest`.",
    agentFailed: (detail) => (detail ? `Request to Claude failed: ${detail}` : "Request to Claude failed."),
    recipeLanguage: "Write every title, summary, and phase name in English.",
  },
};

/** CLI 用の文言を返す。関数エントリは引数を適用した文字列を返す */
export function cliText(lang, key, ...args) {
  const table = CLI_MESSAGES[normalizeLang(lang) ?? "ja"] ?? CLI_MESSAGES.ja;
  const entry = table[key];
  if (entry === undefined) throw new Error(`unknown cli message: ${key}`);
  return typeof entry === "function" ? entry(...args) : entry;
}
