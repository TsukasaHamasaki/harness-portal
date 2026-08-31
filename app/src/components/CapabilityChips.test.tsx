/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CATEGORIES } from "../../../shared/categories.mjs";
import { CapabilityChips } from "./CapabilityChips";
import { buildCapabilityMap } from "../lib/capabilities";
import { KIND_COLORS, KIND_LABELS_JA } from "../lib/kind-colors";
import type { HarnessSnapshot } from "../lib/schema";

const sample = JSON.parse(
  readFileSync(resolve(process.cwd(), "fixtures/harness.sample.json"), "utf8"),
) as HarnessSnapshot;
const categories = buildCapabilityMap(sample);

afterEach(() => cleanup());

describe("CapabilityChips", () => {
  it("renders every item in category and localeCompare order without shortening", () => {
    render(<CapabilityChips categories={[...categories].reverse()} />);

    const categorySections = screen.getAllByTestId(/^capability-category-/);
    expect(categorySections.map((section) => section.getAttribute("data-testid"))).toEqual(
      CATEGORIES.map((category) => `capability-category-${category.id}`),
    );

    const expectedItems = categories.reduce((total, category) => total + category.items.length, 0);
    const chips = screen.getAllByTestId("capability-chip");
    expect(chips).toHaveLength(expectedItems);
    expect(chips.every((chip) => !chip.textContent?.includes("…") && !chip.textContent?.includes("..."))).toBe(true);

    for (const category of categories) {
      const section = screen.getByTestId(`capability-category-${category.id}`);
      const expected = [...category.items].sort((left, right) => left.title.localeCompare(right.title));
      const actual = within(section).queryAllByTestId("capability-chip");
      expect(actual.map((chip) => chip.textContent)).toEqual(expected.map((item) => item.title));

      for (const [index, chip] of actual.entries()) {
        const item = expected[index];
        expect(chip.textContent).toBe(item.title);
        expect(chip.getAttribute("title")).toBe(item.summary || "説明なし");
        expect(chip.getAttribute("aria-label")).toBe(
          `${item.title}（${KIND_LABELS_JA[item.kind]}・${category.label}）`,
        );
        const marker = within(chip).getByTestId("capability-chip-marker");
        expect(marker.getAttribute("data-color")).toBe(KIND_COLORS[item.kind]);
      }
    }

    const legend = screen.getByRole("group", { name: "能力の種別凡例" });
    const legendMarkers = within(legend).getAllByTestId("capability-legend-marker");
    for (const kind of Object.keys(KIND_LABELS_JA) as Array<keyof typeof KIND_LABELS_JA>) {
      expect(within(legend).getByText(KIND_LABELS_JA[kind], { exact: true })).toBeTruthy();
      const marker = legendMarkers.find((candidate) => candidate.getAttribute("data-kind") === kind);
      expect(marker).toBeTruthy();
      expect(marker?.getAttribute("data-color")).toBe(KIND_COLORS[kind]);
    }
  });

  it("searches names, summaries, and trigger examples and removes empty categories", () => {
    render(<CapabilityChips categories={categories} />);
    const search = screen.getByRole("searchbox", { name: "能力を検索" });

    fireEvent.change(search, { target: { value: "slide-maker" } });
    expect(screen.getAllByTestId("capability-chip").map((chip) => chip.textContent)).toEqual(["slide-maker"]);
    expect(screen.queryByTestId("capability-category-browser")).toBeNull();

    fireEvent.change(search, { target: { value: "PowerPoint資料" } });
    expect(screen.getAllByTestId("capability-chip").map((chip) => chip.textContent)).toEqual(["slide-maker"]);

    fireEvent.change(search, { target: { value: "スライドを作って" } });
    expect(screen.getAllByTestId("capability-chip").map((chip) => chip.textContent)).toEqual(["slide-maker"]);
  });

  it("opens the existing detail dialog with the full description", () => {
    render(<CapabilityChips categories={categories} />);
    const item = sample.skills[0];
    fireEvent.click(screen.getByRole("button", {
      name: `${item.name}（スキル・ブラウザを操作する）`,
    }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".detail-text")?.textContent).toBe(item.description);
  });

  it("keeps the no-shortening and wrapping contracts in the assigned files", () => {
    const componentSource = readFileSync(resolve(process.cwd(), "app/src/components/CapabilityChips.tsx"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "app/src/index.css"), "utf8");
    expect(componentSource).not.toMatch(/\.(slice|substring|substr)\s*\(/);
    expect(css).not.toMatch(/capability-(treemap|card|grid)/i);

    const chipCss = css.slice(css.indexOf(".capability-chip-list"), css.indexOf(".modal-backdrop"));
    expect(chipCss).toMatch(/\.capability-chip-list\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(chipCss).toMatch(/\.capability-chip\s*\{[^}]*max-width:\s*100%/s);
    expect(chipCss).toMatch(/\.capability-chip[^}]*overflow-wrap:\s*anywhere/s);
    expect(chipCss).not.toMatch(/text-overflow\s*:\s*ellipsis/);
    expect(chipCss).not.toMatch(/-webkit-line-clamp/);
  });
});
