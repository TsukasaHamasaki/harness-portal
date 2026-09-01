import { buildCapabilityMap, resolveStepTools, type CapabilityItem } from "./capabilities";
import { KIND_COLORS, kindLabel } from "./kind-colors";
import type { Lang } from "../../../shared/i18n.mjs";
import { countLabel, translate } from "./i18n";
import type { HarnessSnapshot, Recipe } from "./schema";

const SYSTEM_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/:\/\//g, "&#58;//");
}

function styleBlock(): string {
  return `
    :root {
      color-scheme: light;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 24px 64px;
      background: #f5f5f7;
      color: #1a1a1a;
      font-family: ${SYSTEM_FONT_STACK};
      line-height: 1.6;
    }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .export-meta { color: #666; font-size: 13px; margin: 0 0 24px; }
    .category-section, .recipe-card {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      padding: 16px 20px;
      margin-bottom: 16px;
    }
    .category-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .category-heading h2 { font-size: 16px; margin: 0; }
    .category-heading span { color: #888; font-size: 12px; }
    .chip-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid #e2e2e6;
      border-radius: 999px;
      padding: 4px 10px 4px 6px;
      font-size: 13px;
      background: #fafafa;
    }
    .chip-marker {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .chip-label { white-space: normal; word-break: break-word; }
    .empty-state {
      color: #888;
      font-size: 13px;
      padding: 8px 0;
    }
    .recipe-card-title { font-size: 16px; margin: 0 0 2px; }
    .recipe-card-summary { color: #666; font-size: 13px; margin: 0 0 12px; }
    .recipe-canvas {
      margin-top: 16px;
      padding: 20px;
      border-radius: 12px;
      background-color: #fafafa;
      background-image: radial-gradient(circle, #e2e2e6 1px, transparent 1px);
      background-size: 16px 16px;
    }
    .recipe-steps { display: flex; flex-direction: column; align-items: stretch; gap: 12px; }
    .recipe-step {
      flex: 0 0 auto;
      min-width: 150px;
      padding: 12px;
      border-radius: 12px;
      background: #ffffff;
      box-shadow: 0 0 0 1px #e2e2e6;
    }
    .recipe-step-index {
      display: inline-grid;
      place-items: center;
      height: 18px;
      min-width: 18px;
      padding: 0 6px;
      border-radius: 999px;
      background: #f0f0f3;
      color: #666;
      font-size: 11px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .recipe-step-phase { font-weight: 600; font-size: 13px; margin: 0 0 6px; }
    .recipe-step-connector {
      display: flex;
      justify-content: center;
      align-items: center;
      flex: 0 0 auto;
      color: #888;
      transform: rotate(90deg);
    }
    .recipe-step-empty {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #b45309;
      background: #fff3e0;
      border: 1px solid #f0c48a;
      border-radius: 8px;
      padding: 4px 10px;
      font-size: 13px;
    }
    @media print {
      .recipe-canvas { overflow: visible; background-image: none; }
    }
  `;
}

function renderChip(item: CapabilityItem, lang: Lang): string {
  const color = KIND_COLORS[item.kind];
  const label = kindLabel(item.kind, lang);
  return `<span class="chip" title="${escapeHtml(item.summary)}">` +
    `<span class="chip-marker" style="background-color: ${color};" aria-hidden="true"></span>` +
    `<span class="chip-label">${escapeHtml(item.title)}${lang === "ja" ? `（${escapeHtml(label)}）` : ` (${escapeHtml(label)})`}</span>` +
    `</span>`;
}

function renderMapView(snapshot: HarnessSnapshot, lang: Lang): string {
  const categories = buildCapabilityMap(snapshot, lang);
  const sections = categories
    .map((category) => {
      const body =
        category.items.length > 0
          ? `<div class="chip-list">${category.items.map((item) => renderChip(item, lang)).join("")}</div>`
          : `<p class="empty-state">${countLabel(0, lang)}</p>`;
      return (
        `<section class="category-section">` +
        `<div class="category-heading"><h2>${escapeHtml(category.label)}</h2><span>${countLabel(category.items.length, lang)}</span></div>` +
        body +
        `</section>`
      );
    })
    .join("");
  return sections || `<p class="empty-state">${lang === "ja" ? "能力データがありません。" : "No capability data."}</p>`;
}

function renderFlowView(snapshot: HarnessSnapshot, lang: Lang): string {
  const recipes: Recipe[] = Array.isArray(snapshot.recipes) ? snapshot.recipes : [];
  if (recipes.length === 0) {
    return `<p class="empty-state">${escapeHtml(translate(lang, "recipesEmpty"))}</p>`;
  }

  const itemById = new Map<string, CapabilityItem>();
  for (const category of buildCapabilityMap(snapshot, lang)) {
    for (const item of category.items) {
      itemById.set(item.id, item);
    }
  }

  const cards = recipes
    .map((recipe) => {
      const stepsHtml = recipe.steps
        .map((step, index) => {
          const resolved = resolveStepTools(step.itemIds, itemById);
          const connector =
            index < recipe.steps.length - 1
              ? `<svg class="recipe-step-connector" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h16"/><path d="M13 6l6 6-6 6"/></svg>`
              : "";
          const body =
            resolved.length > 0
              ? `<div class="chip-list">${resolved.map((item) => renderChip(item, lang)).join("")}</div>`
              : `<span class="recipe-step-empty">${escapeHtml(translate(lang, "noTool"))}</span>`;
          return (
            `<div class="recipe-step">` +
            `<span class="recipe-step-index">${index + 1}</span>` +
            `<p class="recipe-step-phase">${escapeHtml(step.phase)}</p>` +
            body +
            `</div>` +
            connector
          );
        })
        .join("");
      return (
        `<section class="recipe-card">` +
        `<h2 class="recipe-card-title">${escapeHtml(recipe.title)}</h2>` +
        (recipe.summary ? `<p class="recipe-card-summary">${escapeHtml(recipe.summary)}</p>` : "") +
        `<div class="recipe-canvas"><div class="recipe-steps">${stepsHtml}</div></div>` +
        `</section>`
      );
    })
    .join("");
  return cards;
}

export function buildStandaloneHtml(input: {
  title: string;
  view: "map" | "flow";
  snapshot: HarnessSnapshot;
  lang?: Lang;
}): string {
  const { title, view, snapshot } = input;
  const lang: Lang = input.lang ?? "ja";
  const body = view === "flow" ? renderFlowView(snapshot, lang) : renderMapView(snapshot, lang);
  const exportedAt = typeof snapshot.exportedAt === "string" ? snapshot.exportedAt : "";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${styleBlock()}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="export-meta">${escapeHtml(view === "flow" ? translate(lang, "tabFlow") : translate(lang, "tabMap"))} / ${escapeHtml(exportedAt)}</p>
${body}
</body>
</html>`;
}
