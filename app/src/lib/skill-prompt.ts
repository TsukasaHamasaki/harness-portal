import type { Recipe } from "./schema";
import type { CapabilityItem } from "./capabilities";
import { resolveStepTools } from "./capabilities";
import { kindLabel } from "./kind-colors";
import type { Lang } from "../../../shared/i18n.mjs";
import type { ZipEntry } from "./zip";

const TEXT = {
  ja: {
    noTool: "   - ⚠ 手段なし — 現在のハーネスにこの工程を実現する手段がありません。代替案を提案するか、ユーザーに確認してください。",
    title: (t: string) => `# スキル化依頼: ${t}`,
    intro: "以下のワークフローを Claude Code のスキルとして実装してください。",
    purpose: "## 目的",
    steps: "## 工程と使うツール",
    output: "## 成果物",
    requirements: "## SKILL.md の要件",
    reqLines: [
      "- frontmatter に `name` と `description` を書く",
      "- `description` には、このスキルを発火させたい言い回しを「」で複数含める（例:「〇〇して」「〇〇のスキルを使って」）",
      "- 上記の各工程で、そこに挙げたツール（スキル・MCP・エージェント・プラグイン・コマンド）を使う手順として記述する",
      "- 「手段なし」の工程がある場合は、その旨と代替案の検討・ユーザーへの確認を手順に含める",
    ],
    notes: "## 補足",
    notesBody: "SKILL.md の作成には skill-creator スキルを使ってよい。",
    kindWrap: (label: string) => `（${label}）`,
  },
  en: {
    noTool: "   - ⚠ No tool available — nothing in the current harness covers this step. Propose an alternative or check with the user.",
    title: (t: string) => `# Skill request: ${t}`,
    intro: "Implement the following workflow as a Claude Code skill.",
    purpose: "## Purpose",
    steps: "## Steps and tools",
    output: "## Deliverable",
    requirements: "## SKILL.md requirements",
    reqLines: [
      "- Write `name` and `description` in the frontmatter",
      "- In `description`, include several trigger phrases in quotes that should invoke this skill (e.g. \"do X\", \"use the X skill\")",
      "- Describe each step above as a procedure that uses the listed tools (skills, MCP servers, agents, plugins, commands)",
      "- If a step has no tool available, say so and include considering alternatives / checking with the user in the procedure",
    ],
    notes: "## Notes",
    notesBody: "You may use the skill-creator skill to write SKILL.md.",
    kindWrap: (label: string) => ` (${label})`,
  },
} as const;

function toolBullet(item: CapabilityItem, lang: Lang): string {
  const head = `   - \`${item.title}\`${TEXT[lang].kindWrap(kindLabel(item.kind, lang))}`;
  return item.summary === "" ? head : `${head} — ${item.summary}`;
}

function stepSection(step: { phase: string; itemIds: string[] }, itemMap: Map<string, CapabilityItem>, lang: Lang): string {
  const tools = resolveStepTools(step.itemIds, itemMap);
  const bullets = tools.length === 0 ? [TEXT[lang].noTool] : tools.map((tool) => toolBullet(tool, lang));
  return [`${step.phase}`, ...bullets].join("\n");
}

export function buildSkillPrompt(input: { recipe: Recipe; items: CapabilityItem[]; lang?: Lang }): string {
  const { recipe, items } = input;
  const lang: Lang = input.lang ?? "ja";
  const text = TEXT[lang];
  const itemMap = new Map(items.map((item) => [item.id, item] as const));

  const stepsMarkdown = recipe.steps
    .map((step, index) => {
      const body = stepSection(step, itemMap, lang);
      const lines = body.split("\n");
      const [phaseLine, ...bulletLines] = lines;
      return [`${index + 1}. **${phaseLine}**`, ...bulletLines].join("\n");
    })
    .join("\n");

  return [
    text.title(recipe.title),
    "",
    text.intro,
    "",
    text.purpose,
    recipe.summary,
    "",
    text.steps,
    stepsMarkdown,
    "",
    text.output,
    `\`~/.claude/skills/${recipe.id}/SKILL.md\``,
    "",
    text.requirements,
    ...text.reqLines,
    "",
    text.notes,
    text.notesBody,
    "",
  ].join("\n");
}

function sanitizeFileNameBase(id: string, index: number): string {
  const base = id.replace(/[^a-zA-Z0-9._-]/g, "-");
  return base === "" ? `recipe-${index + 1}` : base;
}

/** 全レシピのskill化プロンプトを、ZIPに入れるエントリの配列として返す。AIを呼ばない同期関数。 */
export function buildAllSkillPromptEntries(input: { recipes: Recipe[]; items: CapabilityItem[]; lang?: Lang }): ZipEntry[] {
  const { recipes, items } = input;
  const lang: Lang = input.lang ?? "ja";
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

    return { name, content: buildSkillPrompt({ recipe, items, lang }) };
  });
}
