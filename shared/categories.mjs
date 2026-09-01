/** @typedef {'browser'|'docs'|'media'|'transcribe'|'writing'|'ec'|'gws'|'notion'|'web'|'research'|'dev'|'data'|'comm'|'other'} CategoryId */

/** @type {{id: CategoryId, label: string, emoji: string, order: number}[]} */
export const CATEGORIES = [
  { id: "browser", label: "ブラウザを操作する", labelEn: "Browser automation", emoji: "🌍", order: 1 },
  { id: "docs", label: "資料・スライドを作る", labelEn: "Documents & slides", emoji: "📊", order: 2 },
  { id: "media", label: "動画・画像を作る", labelEn: "Video & images", emoji: "🎬", order: 3 },
  { id: "transcribe", label: "文字起こし・議事録", labelEn: "Transcription & minutes", emoji: "🎙️", order: 4 },
  { id: "writing", label: "文章を書く", labelEn: "Writing", emoji: "✍️", order: 5 },
  { id: "ec", label: "ECの仕事", labelEn: "E-commerce", emoji: "🛒", order: 6 },
  { id: "gws", label: "Google Workspace・メール", labelEn: "Google Workspace & email", emoji: "📧", order: 7 },
  { id: "notion", label: "Notion・タスク管理", labelEn: "Notion & task management", emoji: "🗂️", order: 8 },
  { id: "web", label: "Webサイトを作る・公開", labelEn: "Build & publish websites", emoji: "🌐", order: 9 },
  { id: "research", label: "調べもの・リサーチ", labelEn: "Research", emoji: "🔍", order: 10 },
  { id: "dev", label: "開発・エージェント運用", labelEn: "Development & agent ops", emoji: "🛠️", order: 11 },
  { id: "data", label: "データ分析", labelEn: "Data analysis", emoji: "📈", order: 12 },
  { id: "comm", label: "コミュニケーション", labelEn: "Communication", emoji: "💬", order: 13 },
  { id: "other", label: "その他", labelEn: "Other", emoji: "📦", order: 14 },
];

export const CATEGORY_IDS = CATEGORIES.map(({ id }) => id);
const CATEGORY_ID_SET = new Set(CATEGORY_IDS);

/** @param {unknown} value @returns {value is CategoryId} */
export function isCategoryId(value) {
  return typeof value === "string" && CATEGORY_ID_SET.has(value);
}

const RULES = [
  ["browser", [
    "browser", "chrome", "playwright", "puppeteer", "selenium", "web操作", "ブラウザ", "クローム",
    "ブラウザ操作", "browser automation",
  ]],
  ["docs", [
    "slide", "slides", "slideshow", "presentation", "powerpoint", "pptx", "marp", "deck", "document",
    "資料", "スライド", "プレゼン", "パワポ", "ドキュメント作成",
  ]],
  ["media", [
    "video", "image", "photo", "thumbnail", "animation", "remotion", "ffmpeg", "design", "visual",
    "動画", "画像", "写真", "映像", "サムネ", "アニメ", "デザイン", "イラスト",
  ]],
  ["transcribe", [
    "transcrib", "transcript", "whisper", "caption", "subtitle", "meeting minutes", "文字起こし", "議事録",
    "音声認識", "字幕", "録音文字",
  ]],
  ["writing", [
    "writing", "writer", "copywriting", "article", "blog", "editorial", "proofread", "文章", "執筆",
    "ライティング", "記事", "コピー", "校正", "文章作成",
  ]],
  ["ec", [
    "e-commerce", "ecommerce", "rakuten", "amazon seller", "shopify", "rms", "catalog", "product listing",
    "楽天", "楽天市場", "商品ページ", "商品登録", "出品", "店舗運営", "ec", "ＥＣ",
  ]],
  ["gws", [
    "google workspace", "gmail", "google drive", "google calendar", "google sheets", "gws", "spreadsheet",
    "メール", "メール配信", "グーグルドライブ", "スプレッドシート", "カレンダー",
  ]],
  ["notion", ["notion", "task management", "project management", "タスク管理", "タスク", "プロジェクト管理"]],
  ["web", [
    "website", "web site", "webpage", "frontend", "html", "css", "next.js", "vercel", "netlify", "deploy",
    "ホームページ", "ウェブサイト", "webサイト", "サイト制作", "サイト公開", "公開",
  ]],
  ["research", [
    "research", "literature", "investigate", "search", "browser search", "調査", "リサーチ", "検索", "調べもの",
    "調べ物", "情報収集", "論文",
  ]],
  ["dev", [
    "developer", "development", "coding", "programming", "software", "sdk", "api", "cli", "github", "git",
    "agent", "automation", "開発", "プログラミング", "コード", "実装", "エージェント", "自動化", "開発者",
  ]],
  ["data", [
    "data analysis", "analytics", "dataset", "database", "sql", "bi tool", "データ分析", "データ解析", "集計",
    "データベース", "統計", "可視化",
  ]],
  ["comm", [
    "slack", "chatwork", "microsoft teams", "discord", "communication", "messaging", "コミュニケーション",
    "チャット", "連絡", "社内連携",
  ]],
];

function matchesKeyword(text, keyword) {
  const normalizedKeyword = keyword.toLocaleLowerCase();
  if (/^[a-z0-9][a-z0-9 ._+/-]*[a-z0-9]$|^[a-z0-9]$/i.test(normalizedKeyword)) {
    const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(text);
  }
  return text.includes(normalizedKeyword);
}

/**
 * Classify by intentionally conservative keywords. Unknown material remains
 * null so callers can distinguish it from the explicit "other" bucket.
 * @param {unknown} name
 * @param {unknown} description
 * @returns {CategoryId|null}
 */
export function classifyByRule(name, description) {
  const text = `${typeof name === "string" ? name : ""}\n${typeof description === "string" ? description : ""}`.toLocaleLowerCase();
  for (const [id, keywords] of RULES) {
    if (keywords.some((keyword) => matchesKeyword(text, keyword))) return id;
  }
  return null;
}

/** 言語に応じたカテゴリ名。未知の id や未対応言語は日本語ラベル（無ければ id）を返す */
export function categoryLabel(id, lang = "ja") {
  const category = CATEGORIES.find((entry) => entry.id === id);
  if (!category) return String(id);
  return lang === "en" ? category.labelEn : category.label;
}
