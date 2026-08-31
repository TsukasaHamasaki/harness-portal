/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportButtons } from "./ExportButtons";
import type { CapabilityItem } from "../lib/capabilities";
import type { HarnessSnapshot } from "../lib/schema";

afterEach(() => cleanup());

const items: CapabilityItem[] = [
  {
    id: "skill:direction",
    kind: "skill",
    title: "direction",
    summary: "",
    emoji: "🧩",
    categoryId: "other",
    source: "rule",
    triggers: [],
    detail: "direction",
    occurrences: 1,
  },
];

function makeSnapshot(overrides: Partial<HarnessSnapshot> = {}): HarnessSnapshot {
  return {
    schemaVersion: "1",
    exportedAt: "2026-08-19T00:00:00.000Z",
    exporter: { name: "test", version: "0" },
    environment: { os: "test", node: "test" },
    counts: {} as HarnessSnapshot["counts"],
    skills: [],
    agents: [],
    mcpServers: [],
    plugins: [],
    commands: [],
    hooks: [],
    permissions: {} as HarnessSnapshot["permissions"],
    recipes: [
      {
        id: "lp-production",
        title: "LP作成",
        summary: "企画から公開まで",
        steps: [{ phase: "ディレクション", itemIds: ["skill:direction"] }],
      },
    ],
    claudeMd: { sections: [] },
    settings: { model: null, effortLevel: null, envKeyNames: [] },
    warnings: [],
    ...overrides,
  } as HarnessSnapshot;
}

describe("ExportButtons", () => {
  it("flowビューでは一括ZIPボタンが出る", () => {
    render(<ExportButtons view="flow" snapshot={makeSnapshot()} items={items} />);
    expect(screen.getByTestId("export-skill-prompts-zip")).toBeTruthy();
  });

  it("mapビューでは一括ZIPボタンが出ない", () => {
    render(<ExportButtons view="map" snapshot={makeSnapshot()} items={items} />);
    expect(screen.queryByTestId("export-skill-prompts-zip")).toBeNull();
  });

  it("recipesが空なら一括ZIPボタンが出ない", () => {
    render(<ExportButtons view="flow" snapshot={makeSnapshot({ recipes: [] })} items={items} />);
    expect(screen.queryByTestId("export-skill-prompts-zip")).toBeNull();
  });

  it("createObjectURLをスタブした環境でクリックしても例外が出ない", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalPrint = window.print;
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    window.print = vi.fn();

    render(<ExportButtons view="flow" snapshot={makeSnapshot()} items={items} />);
    const button = screen.getByTestId("export-skill-prompts-zip");
    expect(() => fireEvent.click(button)).not.toThrow();

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    window.print = originalPrint;
  });

  it("既存のHTMLで保存・PDFで保存ボタンが残っている", () => {
    render(<ExportButtons view="flow" snapshot={makeSnapshot()} items={items} />);
    expect(screen.getByText("HTMLで保存")).toBeTruthy();
    expect(screen.getByText("PDFで保存")).toBeTruthy();
  });
});
