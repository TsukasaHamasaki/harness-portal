import { useMemo, useState } from "react";
import type { CapabilityItem } from "../lib/capabilities";
import { KIND_COLORS, KIND_LABELS_JA } from "../lib/kind-colors";
import { CapabilityDetailDialog } from "./CapabilityDetailDialog";
import { CategoryIcon } from "../lib/category-icons";
import type { CategoryId } from "../../../shared/categories.mjs";

export type CapabilityChipsCategory = {
  id: string;
  label: string;
  emoji: string;
  order: number;
  items: CapabilityItem[];
};

type CapabilityChipsProps = {
  categories: CapabilityChipsCategory[];
};

const KINDS: CapabilityItem["kind"][] = ["skill", "mcp", "agent", "plugin", "command"];

function stableSort<T>(values: T[], compare: (left: T, right: T) => number): T[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => compare(left.value, right.value) || left.index - right.index)
    .map(({ value }) => value);
}

function matchesQuery(item: CapabilityItem, query: string): boolean {
  if (!query) return true;
  return [item.title, item.summary, ...item.triggers]
    .some((value) => value.toLocaleLowerCase().includes(query));
}

function CapabilityChip({ item, category, onSelect }: {
  item: CapabilityItem;
  category: CapabilityChipsCategory;
  onSelect: () => void;
}) {
  const color = KIND_COLORS[item.kind];
  const duplicated = item.occurrences > 1;
  const label = duplicated
    ? `${item.title}（${KIND_LABELS_JA[item.kind]}・${category.label}・${item.occurrences}プロジェクトに登録）`
    : `${item.title}（${KIND_LABELS_JA[item.kind]}・${category.label}）`;

  return (
    <button
      className="capability-chip"
      type="button"
      data-testid="capability-chip"
      data-item-id={item.id}
      aria-label={label}
      title={item.summary || "説明なし"}
      onClick={onSelect}
    >
      <span
        className="capability-chip-marker"
        data-testid="capability-chip-marker"
        data-kind={item.kind}
        data-color={color}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="capability-chip-label">{item.title}</span>
      {duplicated && (
        <span
          className="capability-chip-occurrences"
          data-testid="capability-chip-occurrences"
          aria-hidden="true"
        >
          ×{item.occurrences}
        </span>
      )}
    </button>
  );
}

export function CapabilityChips({ categories }: CapabilityChipsProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CapabilityItem | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleCategories = useMemo(() => {
    const orderedCategories = stableSort(categories, (left, right) => left.order - right.order);
    return orderedCategories
      .map((category) => ({
        ...category,
        items: stableSort(category.items, (left, right) => left.title.localeCompare(right.title))
          .filter((item) => matchesQuery(item, normalizedQuery)),
      }))
      .filter((category) => normalizedQuery.length === 0 || category.items.length > 0);
  }, [categories, normalizedQuery]);
  const visibleCount = visibleCategories.reduce((total, category) => total + category.items.length, 0);

  return (
    <section className="capability-chips" aria-labelledby="capability-chips-heading">
      <div className="view-heading capability-chips-heading-row">
        <div>
          <p className="section-kicker">CAPABILITY CHIPS</p>
          <h2 id="capability-chips-heading">何ができる状態か</h2>
          <p className="view-description">名前・要約・トリガー例文から検索できます。</p>
        </div>
        <div className="search-wrap">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            aria-label="能力を検索"
            placeholder="名前・要約・トリガー例文で検索…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="search-count" data-testid="capability-chip-count">{visibleCount}件</span>
        </div>
      </div>

      <div className="capability-chips-legend" role="group" aria-label="能力の種別凡例">
        {KINDS.map((kind) => (
          <span className="capability-chips-legend-item" key={kind}>
            <span
              className="capability-chips-legend-marker"
              data-testid="capability-legend-marker"
              data-kind={kind}
              data-color={KIND_COLORS[kind]}
              style={{ backgroundColor: KIND_COLORS[kind] }}
              aria-hidden="true"
            />
            {KIND_LABELS_JA[kind]}
          </span>
        ))}
      </div>

      <div className="category-stack capability-chip-category-stack">
        {visibleCategories.map((category) => (
          <section
            className="category-section capability-chip-category"
            data-testid={`capability-category-${category.id}`}
            key={category.id}
            aria-labelledby={`capability-category-heading-${category.id}`}
          >
            <div className="category-heading">
              <h3 id={`capability-category-heading-${category.id}`}>
                <CategoryIcon id={category.id as CategoryId} className="category-icon" />{category.label}
              </h3>
              <span>{category.items.length}件</span>
            </div>
            {category.items.length > 0 ? (
              <div className="capability-chip-list" data-testid="capability-chip-list">
                {category.items.map((item) => (
                  <CapabilityChip
                    key={item.id}
                    item={item}
                    category={category}
                    onSelect={() => setSelected(item)}
                  />
                ))}
              </div>
            ) : (
              <p className="capability-chips-empty">0</p>
            )}
          </section>
        ))}
      </div>

      {selected ? <CapabilityDetailDialog item={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}
