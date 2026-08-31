import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Recipe } from "../lib/schema";
import type { CapabilityItem } from "../lib/capabilities";
import { KIND_COLORS } from "../lib/kind-colors";
import { resolveStepTools } from "../lib/capabilities";
import { buildSkillPrompt } from "../lib/skill-prompt";
import { buildEdgePath, buildEdgeGeometries, type EdgeGeometry } from "../lib/edge-path";
import { CapabilityDetailDialog } from "./CapabilityDetailDialog";

type RecipeFlowProps = {
  recipes: Recipe[];
  items: CapabilityItem[];
};

function WarningIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 2 20h20Z" />
      <path d="M12 9v5" />
      <path d="M12 17.5v.01" />
    </svg>
  );
}

function RecipeStepTools({
  tools,
  onSelect,
}: {
  tools: CapabilityItem[];
  onSelect: (item: CapabilityItem) => void;
}) {
  if (tools.length === 0) {
    return (
      <div className="recipe-step-empty" style={{ color: "var(--orange)", background: "var(--orange-tint)" }}>
        <WarningIcon />
        <span>手段なし</span>
      </div>
    );
  }
  return (
    <div className="recipe-step-tools">
      {tools.map((item) => (
        <button key={item.id} type="button" className="capability-chip" title={item.title} onClick={() => onSelect(item)}>
          <span
            className="capability-chip-marker"
            style={{ backgroundColor: KIND_COLORS[item.kind] }}
            aria-hidden="true"
          />
          <span className="capability-chip-label">{item.title}</span>
        </button>
      ))}
    </div>
  );
}

function RecipeCard({
  recipe,
  itemMap,
  onSelect,
}: {
  recipe: Recipe;
  itemMap: Map<string, CapabilityItem>;
  onSelect: (item: CapabilityItem) => void;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [edges, setEdges] = useState<EdgeGeometry[]>(() =>
    recipe.steps.slice(1).map(() => ({ x1: 0, y1: 0, x2: 0, y2: 0, laneY: null })),
  );

  useLayoutEffect(() => {
    const measure = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const canvasBox = {
        left: canvasRect.left,
        top: canvasRect.top,
        right: canvasRect.right,
        bottom: canvasRect.bottom,
      };
      const nodeBoxes = recipe.steps.map((_, i) => {
        const el = nodeRefs.current[i];
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      });
      setEdges(buildEdgeGeometries(nodeBoxes, canvasBox));
    };

    measure();

    const canvas = canvasRef.current;
    if (canvas && typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => measure());
      observer.observe(canvas);
      return () => observer.disconnect();
    }
    return undefined;
  }, [recipe.steps.length]);

  const handleSkillPrompt = () => {
    const md = buildSkillPrompt({ recipe, items: [...itemMap.values()] });
    const a = document.createElement("a");
    a.href = `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`;
    a.download = `skill-prompt-${recipe.id}.md`;
    a.click();
    navigator.clipboard?.writeText?.(md)?.catch(() => {});
  };

  return (
    <article
      className="recipe-card"
      data-testid="recipe-card"
      style={{
        background: "var(--surface)",
        boxShadow: "var(--shadow-card)",
        borderRadius: "var(--radius-card)",
      }}
    >
      <div className="recipe-card-head">
        <div>
          <h3 className="recipe-card-title">{recipe.title}</h3>
          <p className="recipe-card-summary">{recipe.summary}</p>
        </div>
        <button
          type="button"
          className="recipe-skill-button"
          data-testid="recipe-skill-prompt"
          onClick={handleSkillPrompt}
        >
          skill化プロンプト
        </button>
      </div>
      <div className="recipe-canvas" ref={canvasRef}>
        <svg className="recipe-edges">
          <defs>
            <marker
              id={`recipe-arrow-${recipe.id}`}
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0 0 L8 4 L0 8 Z" fill="var(--ink-3)" />
            </marker>
          </defs>
          {edges.map((edge, index) => (
            <path
              key={`${recipe.id}-edge-${index}`}
              data-testid="recipe-edge"
              d={buildEdgePath(edge)}
              stroke="var(--line-strong)"
              strokeWidth={1.75}
              fill="none"
              markerEnd={`url(#recipe-arrow-${recipe.id})`}
            />
          ))}
        </svg>
        <div className="recipe-nodes">
          {recipe.steps.map((step, index) => {
            const tools = resolveStepTools(step.itemIds, itemMap);
            return (
              <div
                className="recipe-step"
                data-testid="recipe-step"
                key={`${recipe.id}-${step.phase}-${index}`}
                ref={(el) => {
                  nodeRefs.current[index] = el;
                }}
              >
                <span className="recipe-step-index" data-testid="recipe-step-index">
                  {index + 1}
                </span>
                <div className="recipe-step-phase">{step.phase}</div>
                <RecipeStepTools tools={tools} onSelect={onSelect} />
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}

export function RecipeFlow({ recipes, items }: RecipeFlowProps) {
  const [selected, setSelected] = useState<CapabilityItem | null>(null);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  if (recipes.length === 0) {
    return (
      <div className="recipe-flow-empty">
        <p>フローは npx harness-portal（--no-agent なし）で生成されます</p>
      </div>
    );
  }

  return (
    <div className="recipe-flow">
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} itemMap={itemMap} onSelect={setSelected} />
      ))}
      {selected ? <CapabilityDetailDialog item={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
