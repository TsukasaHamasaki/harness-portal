import type { Recipe } from "./schema";
import type { CapabilityItem } from "./capabilities";
import { resolveStepTools } from "./capabilities";
import { KIND_LABELS_JA } from "./kind-colors";
import type { ZipEntry } from "./zip";

const NO_TOOL_LINE =
  "   - ⚠ 手段なし — 現在のハーネスにこの工程を実現する手段がありません。代替案を提案するか、ユーザーに確認してください。";

function toolBullet(item: CapabilityItem): string {
  const kindLabel = KIND_LABELS_JA[item.kind];
  const head = `   - \`${item.title}\`（${kindLabel}）`;
  return item.summary === "" ? head : `${head} — ${item.summary}`;
}

function stepSection(step: { phase: string; itemIds: string[] }, itemMap: Map<string, CapabilityItem>): string {
  const tools = resolveStepTools(step.itemIds, itemMap);
  const bullets = tools.length === 0 ? [NO_TOOL_LINE] : tools.map(toolBullet);
  return [`${step.phase}`, ...bullets].join("\n");
}

export function buildSkillPrompt(input: { recipe: Recipe; items: CapabilityItem[] }): string {
  const { recipe, items } = input;
  const itemMap = new Map(items.map((item) => [item.id, item] as const));

  const stepsMarkdown = recipe.steps
    .map((step, index) => {
      const body = stepSection(step, itemMap);
      const lines = body.split("\n");
      const [phaseLine, ...bulletLines] = lines;
      return [`${index + 1}. **${phaseLine}**`, ...bulletLines].join("\n");
    })
    .join("\n");

  return [
    `# スキル化依頼: ${recipe.title}`,
    "",
    "以下のワークフローを Claude Code のスキルとして実装してください。",
    "",
    "## 目的",
    recipe.summary,
    "",
    "## 工程と使うツール",
    stepsMarkdown,
    "",
    "## 成果物",
    `\`~/.claude/skills/${recipe.id}/SKILL.md\``,
    "",
    "## SKILL.md の要件",
    "- frontmatter に `name` と `description` を書く",
    "- `description` には、このスキルを発火させたい言い回しを「」で複数含める（例:「〇〇して」「〇〇のスキルを使って」）",
    "- 上記の各工程で、そこに挙げたツール（スキル・MCP・エージェント・プラグイン・コマンド）を使う手順として記述する",
    "- 「手段なし」の工程がある場合は、その旨と代替案の検討・ユーザーへの確認を手順に含める",
    "",
    "## 補足",
    "SKILL.md の作成には skill-creator スキルを使ってよい。",
    "",
  ].join("\n");
}

function sanitizeFileNameBase(id: string, index: number): string {
  const base = id.replace(/[^a-zA-Z0-9._-]/g, "-");
  return base === "" ? `recipe-${index + 1}` : base;
}

/** 全レシピのskill化プロンプトを、ZIPに入れるエントリの配列として返す。AIを呼ばない同期関数。 */
export function buildAllSkillPromptEntries(input: { recipes: Recipe[]; items: CapabilityItem[] }): ZipEntry[] {
  const { recipes, items } = input;
  const usedNames = new Set<string>();

  return recipes.map((recipe, index) => {
    const base = sanitizeFileNameBase(recipe.id, index);
    let name = `skill-prompt-${base}.md`;
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `skill-prompt-${base}-${suffix}.md`;
      suffix += 1;
    }
    usedNames.add(name);

    return { name, content: buildSkillPrompt({ recipe, items }) };
  });
}
