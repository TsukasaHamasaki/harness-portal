import { classifyByRule, isCategoryId } from "../shared/categories.mjs";

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_TIMEOUT_MS = 120_000;

function ruleCategory(item) {
  return classifyByRule(item?.name || item?.id || "", item?.description || "");
}

function batchItems(items, batchSize) {
  const batches = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

function promptForBatch(items) {
  return [
    "Classify each item into exactly one of these category ids:",
    "browser, docs, media, transcribe, writing, ec, gws, notion, web, research, dev, data, comm, other.",
    "Return only a JSON object mapping each item id to a category id. Do not add markdown.",
    JSON.stringify(items.map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      description: item.description,
    }))),
  ].join("\n");
}

function textFromMessage(message) {
  if (typeof message === "string") return message;
  if (!message || typeof message !== "object") return "";
  if (typeof message.text === "string") return message.text;
  if (typeof message.result === "string") return message.result;
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => typeof part === "string" ? part : typeof part?.text === "string" ? part.text : "")
      .join("");
  }
  if (message.message && typeof message.message === "object") return textFromMessage(message.message);
  return "";
}

async function readQueryResponse(response) {
  const resolved = await response;
  if (resolved && typeof resolved[Symbol.asyncIterator] === "function") {
    const assistantChunks = [];
    let successfulResult;
    for await (const message of resolved) {
      if (message && typeof message === "object" && message.type === "result") {
        if (message.subtype && message.subtype !== "success") {
          throw new Error(`Agent classification returned ${message.subtype}`);
        }
        if (typeof message.result === "string") successfulResult = message.result;
        continue;
      }
      assistantChunks.push(textFromMessage(message));
    }
    return successfulResult ?? assistantChunks.join("");
  }
  return textFromMessage(resolved);
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("classification timed out");
      error.name = "TimeoutError";
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parseJsonObject(response) {
  if (typeof response !== "string") return null;
  const withoutFence = response
    .replace(/^\s*\x60\x60\x60(?:json)?\s*/i, "")
    .replace(/\s*\x60\x60\x60\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(withoutFence);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(withoutFence.slice(start, end + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

async function loadSdkQuery() {
  const sdk = await import("@anthropic-ai/claude-agent-sdk");
  return sdk.query || sdk.default?.query || sdk.default;
}

function fallbackAll(items, warnings, reason) {
  const categories = new Map(items.map((item) => [item.id, ruleCategory(item)]));
  if (reason) warnings.push(reason);
  return { categories, mode: items.length ? "rule" : "none", warnings };
}

export async function classifyItems(items, opts = {}) {
  const sourceItems = Array.isArray(items) ? items : [];
  if (!sourceItems.length) return { categories: new Map(), mode: "none", warnings: [] };
  if (opts.noAgent === true || opts.useAgent === false) return fallbackAll(sourceItems, [], null);

  const batchSize = Number.isInteger(opts.batchSize) && opts.batchSize > 0 ? opts.batchSize : DEFAULT_BATCH_SIZE;
  const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const warnings = [];
  let queryImpl = opts.queryImpl;
  try {
    // Remove the metered API key before importing or calling the SDK.
    delete process.env.ANTHROPIC_API_KEY;
    if (!queryImpl) queryImpl = await loadSdkQuery();
    if (typeof queryImpl !== "function") throw new Error("Agent SDK query unavailable");

    const categories = new Map();
    for (const batch of batchItems(sourceItems, batchSize)) {
      const request = {
        prompt: promptForBatch(batch),
        items: batch,
        batch,
        timeoutMs,
      };
      const response = await withTimeout(readQueryResponse(queryImpl(request)), timeoutMs);
      const parsed = parseJsonObject(response);
      if (!parsed) warnings.push("Agent classification returned invalid JSON; rule fallback applied");
      for (const item of batch) {
        const agentCategory = parsed && parsed[item.id];
        categories.set(item.id, isCategoryId(agentCategory) ? agentCategory : ruleCategory(item));
      }
    }
    return { categories, mode: "agent", warnings };
  } catch (error) {
    const reason = error?.name === "TimeoutError"
      ? "Agent classification timed out; rule fallback applied"
      : "Agent classification failed; rule fallback applied";
    return fallbackAll(sourceItems, warnings, reason);
  }
}
