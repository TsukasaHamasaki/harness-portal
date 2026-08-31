import { describeAgentFailure } from "./agent-failure.mjs";

const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_STEPS = 7;
const MIN_STEPS = 3;
const MAX_RECIPES = 10;

function promptFor(items) {
  return [
    "You are given a list of tools available in a user's Claude Code harness.",
    "Design 6 to 10 task recipes (common workflows) that combine these tools into a step-by-step flow.",
    "Each recipe must have 3 to 7 steps (phases). Each step is a phase name plus the item ids used for it.",
    "If no available tool fits a phase, leave its itemIds empty (this is allowed and expected sometimes).",
    "Only use item ids that appear in the provided list below. Never invent ids.",
    'Return only JSON in this exact shape, with no markdown fence: {"recipes":[{"id":"kebab-case-id","title":"short title","summary":"one line","steps":[{"phase":"phase name","itemIds":["id1","id2"]}]}]}',
    JSON.stringify(items.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
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
          throw new Error(`Agent recipe generation returned ${message.subtype}`);
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
      const error = new Error("recipe generation timed out");
      error.name = "TimeoutError";
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parseJsonPayload(response) {
  if (typeof response !== "string") return null;
  const withoutFence = response
    .replace(/^\s*\x60\x60\x60(?:json)?\s*/i, "")
    .replace(/\s*\x60\x60\x60\s*$/i, "")
    .trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(withoutFence.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function extractRawRecipes(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.recipes)) return parsed.recipes;
  return null;
}

async function loadSdkQuery() {
  const sdk = await import("@anthropic-ai/claude-agent-sdk");
  return sdk.query || sdk.default?.query || sdk.default;
}

function normalizeSteps(rawSteps, knownIds) {
  if (!Array.isArray(rawSteps)) return null;
  const steps = [];
  for (const rawStep of rawSteps) {
    if (!rawStep || typeof rawStep !== "object") continue;
    const phase = rawStep.phase;
    if (typeof phase !== "string" || phase.trim() === "") continue;
    const rawItemIds = Array.isArray(rawStep.itemIds) ? rawStep.itemIds : [];
    const seen = new Set();
    const itemIds = [];
    for (const itemId of rawItemIds) {
      if (typeof itemId !== "string") continue;
      if (!knownIds.has(itemId)) continue;
      if (seen.has(itemId)) continue;
      seen.add(itemId);
      itemIds.push(itemId);
    }
    steps.push({ phase, itemIds });
  }
  return steps;
}

function normalizeRecipes(rawRecipes, knownIds, warnings) {
  const recipes = [];
  const seenIds = new Set();
  for (const rawRecipe of rawRecipes) {
    if (!rawRecipe || typeof rawRecipe !== "object") continue;
    const id = rawRecipe.id;
    const title = rawRecipe.title;
    if (typeof id !== "string" || id.trim() === "") continue;
    if (typeof title !== "string" || title.trim() === "") continue;
    if (seenIds.has(id)) {
      warnings.push(`duplicate recipe id dropped: ${id}`);
      continue;
    }
    const summary = typeof rawRecipe.summary === "string" ? rawRecipe.summary : "";
    let steps = normalizeSteps(rawRecipe.steps, knownIds);
    if (steps === null) continue;
    if (steps.length > MAX_STEPS) steps = steps.slice(0, MAX_STEPS);
    if (steps.length < MIN_STEPS) continue;
    seenIds.add(id);
    recipes.push({ id, title, summary, steps });
  }
  let clamped = recipes;
  if (clamped.length > MAX_RECIPES) clamped = clamped.slice(0, MAX_RECIPES);
  return clamped;
}

export async function buildRecipes(items, opts = {}) {
  const sourceItems = Array.isArray(items) ? items : [];
  if (opts.noAgent === true) {
    return { recipes: [], warnings: ["recipes skipped (--no-agent)"] };
  }
  if (!sourceItems.length) return { recipes: [], warnings: [] };

  const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const warnings = [];
  let queryImpl = opts.queryImpl;
  try {
    // Remove the metered API key before importing or calling the SDK.
    delete process.env.ANTHROPIC_API_KEY;
    if (!queryImpl) queryImpl = await loadSdkQuery();
    if (typeof queryImpl !== "function") throw new Error("Agent SDK query unavailable");

    const request = {
      prompt: promptFor(sourceItems),
      items: sourceItems,
      timeoutMs,
    };
    const response = await withTimeout(readQueryResponse(queryImpl(request)), timeoutMs);
    const parsed = parseJsonPayload(response);
    const rawRecipes = extractRawRecipes(parsed);
    if (!rawRecipes) {
      warnings.push("Agent recipe generation returned invalid JSON");
      return { recipes: [], warnings };
    }

    const knownIds = new Set(sourceItems.map((item) => item.id));
    const recipes = normalizeRecipes(rawRecipes, knownIds, warnings);
    return { recipes, warnings };
  } catch (error) {
    const failureReason = describeAgentFailure(error);
    const reason = (error?.name === "TimeoutError"
      ? "Agent recipe generation timed out"
      : "Agent recipe generation failed") + ` — ${failureReason}`;
    warnings.push(reason);
    return { recipes: [], warnings, failureReason };
  }
}
