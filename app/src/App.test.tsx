/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CATEGORIES } from "../../shared/categories.mjs";
import App from "./App";
import type { HarnessSnapshot } from "./lib/schema";

const sample = JSON.parse(
  readFileSync(resolve(process.cwd(), "fixtures/harness.sample.json"), "utf8"),
) as HarnessSnapshot;

function mockSnapshotEndpoint(value: unknown): void {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/snapshot") return { ok: true, status: 200, json: async () => value };
    if (String(input) === "/api/snapshots") return { ok: true, status: 200, json: async () => [] };
    throw new Error(`unexpected request: ${String(input)}`);
  }));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Harness Portal SPA", () => {
  it("renders the local snapshot, all 14 categories, search filtering, and MCP states", async () => {
    mockSnapshotEndpoint(sample);
    render(<App />);

    expect(await screen.findByRole("button", { name: "マップ" })).toBeTruthy();
    expect(screen.getByText("ローカルモード")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "何ができる状態か" })).toBeTruthy();
    for (const category of CATEGORIES) {
      expect(screen.getByRole("heading", { name: new RegExp(category.label) })).toBeTruthy();
    }
    expect(screen.getByRole("heading", { name: /その他/ })).toBeTruthy();

    const count = screen.getByTestId("capability-chip-count").textContent;
    fireEvent.change(screen.getByRole("searchbox", { name: "能力を検索" }), { target: { value: "slide-maker" } });
    await waitFor(() => expect(screen.getByTestId("capability-chip-count").textContent).not.toBe(count));
    expect(screen.getByTestId("capability-chip-count").textContent).toBe("1件");
    expect(screen.getByText("slide-maker")).toBeTruthy();
    expect(screen.queryByText("browser-helper")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /インベントリ/ }));
    expect(screen.getByText("接続済み")).toBeTruthy();
    expect(screen.getByText("失敗")).toBeTruthy();
    const hooksSection = screen.getByRole("region", { name: "🪝 hooks" });
    expect(within(hooksSection).getByText("PreToolUse: 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /履歴/ }));
    expect(screen.getByText("保存されたスナップショットはありません")).toBeTruthy();
  });

  it("renders the map tab by default as capability chips and exposes exactly four tabs", async () => {
    mockSnapshotEndpoint(sample);
    render(<App />);

    expect((await screen.findByRole("button", { name: "マップ" })).getAttribute("aria-current")).toBe("page");
    const tabNavigation = screen.getByRole("navigation", { name: "表示切り替え" });
    expect(within(tabNavigation).getAllByRole("button")).toHaveLength(4);
    expect(within(tabNavigation).getByRole("button", { name: "マップ" })).toBeTruthy();
    expect(within(tabNavigation).getByRole("button", { name: "フロー" })).toBeTruthy();
    expect(within(tabNavigation).getByRole("button", { name: "インベントリ" })).toBeTruthy();
    expect(within(tabNavigation).getByRole("button", { name: "履歴" })).toBeTruthy();
    expect(within(tabNavigation).queryByRole("button", { name: "一覧" })).toBeNull();
    expect(screen.getByRole("heading", { name: "何ができる状態か" })).toBeTruthy();

    const totalItems = sample.skills.length + sample.agents.length + sample.mcpServers.length + sample.plugins.length + sample.commands.length;
    expect(screen.getByTestId("capability-chip-count").textContent).toBe(`${totalItems}件`);
    expect(screen.getAllByTestId("capability-chip")).toHaveLength(totalItems);
    fireEvent.change(screen.getByRole("searchbox", { name: "能力を検索" }), { target: { value: "slide-maker" } });
    await waitFor(() => expect(screen.getByTestId("capability-chip-count").textContent).toBe("1件"));
    expect(screen.getAllByTestId("capability-chip")).toHaveLength(1);
    expect(screen.getByText("slide-maker")).toBeTruthy();
  });

  it("shows the RecipeFlow empty state when the フロー tab is opened", async () => {
    mockSnapshotEndpoint(sample);
    render(<App />);

    await screen.findByRole("heading", { name: "何ができる状態か" });
    fireEvent.click(screen.getByRole("button", { name: "フロー" }));
    expect(screen.getByText("フローは npx harness-portal（--no-agent なし）で生成されます")).toBeTruthy();
  });

  it("uses local history and supports diff and deletion", async () => {
    const older = JSON.parse(JSON.stringify(sample)) as HarnessSnapshot;
    older.exportedAt = "2026-08-14T01:23:45.000Z";
    older.skills[0].description = "Older browser description";

    const requests: Array<{ url: string; method: string }> = [];
    const localFiles = new Map([
      ["harness-current.json", sample],
      ["harness-older.json", older],
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (url === "/api/snapshot") return { ok: true, status: 200, json: async () => sample };
      if (url === "/api/snapshots") return {
        ok: true,
        status: 200,
        json: async () => [...localFiles].map(([id, value]) => ({ id, exportedAt: value.exportedAt, label: id === "harness-current.json" ? "current" : "older", counts: value.counts })),
      };
      if (url === "/api/snapshots/harness-current.json") return { ok: true, status: 200, json: async () => localFiles.get("harness-current.json") };
      if (url === "/api/snapshots/harness-older.json" && method === "DELETE") {
        localFiles.delete("harness-older.json");
        return { ok: true, status: 204, json: async () => null };
      }
      if (url === "/api/snapshots/harness-older.json") return { ok: true, status: 200, json: async () => localFiles.get("harness-older.json") };
      throw new Error(`unexpected external request: ${String(input)}`);
    }));
    render(<App />);

    await screen.findByRole("heading", { name: "何ができる状態か" });
    fireEvent.click(screen.getByRole("button", { name: /履歴/ }));
    expect(await screen.findByText("older")).toBeTruthy();
    expect(screen.getByText("current")).toBeTruthy();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole("button", { name: "選択した2件を比較" }));
    expect(await screen.findByRole("heading", { name: "スナップショットの差分" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "変更" })).toBeTruthy();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "olderを削除" }));
    await waitFor(() => expect(screen.queryByText("older")).toBeNull());
    expect(requests).toContainEqual({ url: "/api/snapshots/harness-older.json", method: "DELETE" });

    fireEvent.click(screen.getByRole("button", { name: "↻ 履歴を更新" }));
    await waitFor(() => expect(screen.queryByText("older")).toBeNull());
    expect(localFiles.has("harness-older.json")).toBe(false);
  });

  it("秘密情報らしき値は警告のうえマスクしてから描画する", async () => {
    const withSecrets = JSON.parse(JSON.stringify(sample)) as HarnessSnapshot;
    withSecrets.skills[2].description = "private sk-abcdef123456 owner@example.com /Users/anyone/x";
    mockSnapshotEndpoint(withSecrets);
    render(<App />);

    expect(await screen.findByRole("heading", { name: "何ができる状態か" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("秘密情報の可能性");
    fireEvent.click(screen.getByText("mystery-tool"));
    expect(screen.getByRole("dialog").textContent).toContain("[redacted]");
    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toContain("sk-abcdef123456");
    expect(renderedText).not.toContain("owner@example.com");
    expect(renderedText).not.toContain("/Users/anyone/x");
  });

  it("ローカルサーバー外で開くと取り込み画面ではなく案内を出す", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("local endpoint unavailable"); }));
    render(<App />);

    expect(await screen.findByRole("heading", { name: "スナップショットがありません" })).toBeTruthy();
    expect(screen.getByText("スナップショットなし")).toBeTruthy();
    expect(screen.queryByLabelText("JSONを貼り付ける")).toBeNull();
    expect(screen.queryByText("harness.json を取り込む")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "表示切り替え" })).toBeNull();
  });

  it("/api/snapshot が壊れたJSONを返してもクラッシュせず理由を出す", async () => {
    mockSnapshotEndpoint({ schemaVersion: 99 });
    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("スナップショットを読み込めませんでした");
    expect(screen.getByRole("heading", { name: "スナップショットがありません" })).toBeTruthy();
  });

  it("ヘッダーの能力数と検索窓の件数が一致する", async () => {
    const skewed = JSON.parse(JSON.stringify(sample)) as HarnessSnapshot;
    skewed.mcpServers = [
      ...skewed.mcpServers,
      { ...skewed.mcpServers[0], scope: "project" },
      { ...skewed.mcpServers[0], scope: "connector" },
    ];
    skewed.counts = { ...skewed.counts, mcpServers: skewed.mcpServers.length };

    mockSnapshotEndpoint(skewed);
    render(<App />);

    await screen.findByRole("heading", { name: "何ができる状態か" });
    const headerCount = Number(screen.getByTestId("summary-capability-count").textContent?.match(/\d+/)?.[0]);
    const searchCount = Number(screen.getByTestId("capability-chip-count").textContent?.match(/\d+/)?.[0]);
    expect(headerCount).toBe(searchCount);
  });

  it("履歴の更新ボタンを押すとlistSnapshotsが呼ばれエラーにならない", async () => {
    mockSnapshotEndpoint(sample);
    render(<App />);

    await screen.findByRole("button", { name: "マップ" });
    fireEvent.click(screen.getByRole("button", { name: /履歴/ }));
    expect(screen.getByText("保存されたスナップショットはありません")).toBeTruthy();

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockClear();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    fireEvent.click(screen.getByRole("button", { name: "↻ 履歴を更新" }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input) === "/api/snapshots").length;
      expect(calls).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByText(/is not a function/)).toBeNull();
    for (const call of errorSpy.mock.calls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain("is not a function");
      }
    }
    errorSpy.mockRestore();
  });

  it("履歴の更新ボタンにイベントオブジェクトが渡ってもストアが差し替わらない", async () => {
    mockSnapshotEndpoint(sample);
    render(<App />);

    await screen.findByRole("button", { name: "マップ" });
    fireEvent.click(screen.getByRole("button", { name: /履歴/ }));
    expect(screen.getByText("保存されたスナップショットはありません")).toBeTruthy();

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "↻ 履歴を更新" }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input) === "/api/snapshots").length;
      expect(calls).toBeGreaterThanOrEqual(1);
    });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
