import { maskString } from "../shared/redact.mjs";

/**
 * Agent SDK の失敗を、利用者が次に何をすればよいか分かる日本語に変換する。
 * 「分類が規則ベースに落ちた」だけでは、未ログインなのか SDK が壊れているのか判断できない。
 */
export function describeAgentFailure(error) {
  const message = String(error?.message ?? error ?? "");
  if (error?.name === "TimeoutError") {
    return "Claude からの応答がタイムアウトしました。ネットワークを確認して再実行してください。";
  }
  if (/authenticat|oauth|invalid api key|not logged in|please run \/login|401/i.test(message)) {
    return "Claude Code にログインしていません。ターミナルで `claude` を起動して /login を済ませてから、もう一度実行してください。";
  }
  if (/ERR_MODULE_NOT_FOUND|Cannot find (module|package)|query unavailable/i.test(message)) {
    return "Claude Agent SDK を読み込めませんでした。`npx harness-portal@latest` で再取得してください。";
  }
  const trimmed = maskString(message).replace(/\s+/g, " ").trim().slice(0, 200);
  return trimmed ? `Claude への問い合わせに失敗しました: ${trimmed}` : "Claude への問い合わせに失敗しました。";
}
