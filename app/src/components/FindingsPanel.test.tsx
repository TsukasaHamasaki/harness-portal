/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FindingsPanel } from "./FindingsPanel";
import type { HarnessFinding } from "../lib/findings";

afterEach(() => cleanup());

const divergentFinding: HarnessFinding = {
  id: "mcp-divergent:notion",
  kind: "divergent",
  title: "notion が2箇所で別々の設定になっています",
  question: "意図的ですか？ 同じ名前で中身が違うと、どちらが使われるか分かりにくくなります。",
  entries: [
    { label: "global", detail: "mcp.notion.com" },
    { label: "board", detail: "npx -y @notionhq/notion-mcp-server" },
  ],
};

const redundantFinding: HarnessFinding = {
  id: "mcp-redundant:analytics-db",
  kind: "redundant",
  title: "analytics-db が2つのプロジェクトに同じ設定で登録されています",
  question: "意図的ですか？ global スコープにまとめると1つで済みます。",
  entries: [
    { label: "project", detail: "npx analytics-db" },
    { label: "project2", detail: "npx analytics-db" },
  ],
};

describe("FindingsPanel", () => {
  it("findings が空なら何も描画しない", () => {
    const { container } = render(<FindingsPanel findings={[]} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("findings-panel")).toBeNull();
  });

  it("divergent の finding に title と question が文字で出る", () => {
    render(<FindingsPanel findings={[divergentFinding]} />);
    expect(screen.getByText(divergentFinding.title)).toBeTruthy();
    expect(screen.getByText(divergentFinding.question)).toBeTruthy();
  });

  it("entries の label と detail が両方描画される", () => {
    render(<FindingsPanel findings={[divergentFinding]} />);
    for (const entry of divergentFinding.entries) {
      expect(screen.getByText(entry.label)).toBeTruthy();
      expect(screen.getByText(entry.detail)).toBeTruthy();
    }
  });

  it("data-kind に divergent / redundant が入る", () => {
    render(<FindingsPanel findings={[divergentFinding, redundantFinding]} />);
    const cards = screen.getAllByTestId("finding");
    expect(cards.map((card) => card.getAttribute("data-kind"))).toEqual(["divergent", "redundant"]);
  });
});
