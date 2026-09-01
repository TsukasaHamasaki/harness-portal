import { maskString } from "../shared/redact.mjs";
import { cliText } from "../shared/i18n.mjs";

/**
 * Agent SDK の失敗を、利用者が次に何をすればよいか分かる文に変換する。
 * 「分類が規則ベースに落ちた」だけでは、未ログインなのか SDK が壊れているのか判断できない。
 */
export function describeAgentFailure(error, lang = "ja") {
  const message = String(error?.message ?? error ?? "");
  if (error?.name === "TimeoutError") return cliText(lang, "agentTimeout");
  if (/authenticat|oauth|invalid api key|not logged in|please run \/login|401/i.test(message)) {
    return cliText(lang, "agentNotLoggedIn");
  }
  if (/ERR_MODULE_NOT_FOUND|Cannot find (module|package)|query unavailable/i.test(message)) {
    return cliText(lang, "agentSdkMissing");
  }
  const trimmed = maskString(message).replace(/\s+/g, " ").trim().slice(0, 200);
  return cliText(lang, "agentFailed", trimmed);
}
