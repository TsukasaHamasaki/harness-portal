import { useCallback, useEffect, useMemo, useState } from "react";
import { CapabilityChips } from "./components/CapabilityChips";
import { ExportButtons } from "./components/ExportButtons";
import { FindingsPanel } from "./components/FindingsPanel";
import { HistoryView } from "./components/HistoryView";
import { InventoryView } from "./components/InventoryView";
import { RecipeFlow } from "./components/RecipeFlow";
import { SummaryCards } from "./components/SummaryCards";
import { buildCapabilityMap } from "./lib/capabilities";
import { diffSnapshots } from "./lib/diff";
import { findHarnessFindings } from "./lib/findings";
import { createLocalHistoryStore } from "./lib/history";
import type { SnapshotMeta } from "./lib/history";
import { parseSnapshot } from "./lib/schema";
import type { HarnessSnapshot } from "./lib/schema";
import { findSecretLike, maskDeep } from "../../shared/redact.mjs";

type Mode = "loading" | "local" | "unavailable";
type View = "map" | "flow" | "inventory" | "history";

const VIEW_TABS: ReadonlyArray<{ id: View; label: string }> = [
  { id: "map", label: "マップ" },
  { id: "flow", label: "フロー" },
  { id: "inventory", label: "インベントリ" },
  { id: "history", label: "履歴" },
];

function formatImportError(error: unknown): string {
  return error instanceof Error ? error.message : "スナップショットの読み込みに失敗しました。";
}

function parseAndMask(input: unknown): {
  snapshot: HarnessSnapshot | null;
  warnings: string[];
  secretPaths: string[];
  errors: string[];
} {
  const secretPaths = findSecretLike(input);
  const masked = maskDeep(input);
  const result = parseSnapshot(masked);
  if (!result.ok) return { snapshot: null, warnings: [], secretPaths, errors: result.errors };
  return { snapshot: result.data, warnings: result.warnings, secretPaths, errors: [] };
}

function statusLabel(mode: Mode): string {
  if (mode === "local") return "ローカルモード";
  if (mode === "unavailable") return "スナップショットなし";
  return "接続を確認中";
}

export default function App() {
  const [mode, setMode] = useState<Mode>("loading");
  const [snapshot, setSnapshot] = useState<HarnessSnapshot | null>(null);
  const [view, setView] = useState<View>("map");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [snapshotWarnings, setSnapshotWarnings] = useState<string[]>([]);
  const [secretPaths, setSecretPaths] = useState<string[]>([]);
  const [history, setHistory] = useState<SnapshotMeta[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyStore = useMemo(() => createLocalHistoryStore(), []);

  const categories = useMemo(() => snapshot ? buildCapabilityMap(snapshot) : [], [snapshot]);
  const flatItems = useMemo(() => categories.flatMap((category) => category.items), [categories]);
  const findings = useMemo(() => (snapshot ? findHarnessFindings(snapshot) : []), [snapshot]);

  useEffect(() => {
    let active = true;
    fetch("/api/snapshot")
      .then((response) => {
        if ("ok" in response && response.ok === false) throw new Error(`snapshot endpoint returned ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then(async (input) => {
        if (!active) return;
        const result = parseAndMask(input);
        if (result.snapshot) {
          setSnapshot(result.snapshot);
          setSnapshotWarnings(result.warnings);
          setSecretPaths(result.secretPaths);
          setMode("local");
          try {
            setHistory(await historyStore.listSnapshots());
            setHistoryError(null);
          } catch (error) {
            setHistoryError(formatImportError(error));
          }
        } else {
          setParseErrors(result.errors);
          setMode("unavailable");
        }
      })
      .catch(() => {
        if (active) setMode("unavailable");
      });
    return () => {
      active = false;
    };
  }, [historyStore]);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await historyStore.listSnapshots());
    } catch (error) {
      setHistoryError(formatImportError(error));
    } finally {
      setHistoryLoading(false);
    }
  }, [historyStore]);

  async function handleCompare(fileIds: [string, string]) {
    try {
      const [beforeRaw, afterRaw] = await Promise.all(fileIds.map((fileId) => historyStore.loadSnapshot(fileId)));
      const beforeResult = parseAndMask(beforeRaw);
      const afterResult = parseAndMask(afterRaw);
      if (!beforeResult.snapshot || !afterResult.snapshot) throw new Error("比較対象のスナップショットを読み込めませんでした。");
      return diffSnapshots(beforeResult.snapshot, afterResult.snapshot);
    } catch (error) {
      formatImportError(error);
      throw error;
    }
  }

  async function handleDelete(fileId: string): Promise<void> {
    try {
      await historyStore.deleteSnapshot(fileId);
      setHistory((current) => current.filter((item) => item.fileId !== fileId));
    } catch (error) {
      formatImportError(error);
      throw error;
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Harness Portal ホーム">
          <span className="brand-mark">H</span>
          <span><strong>HARNESS</strong><small>PORTAL</small></span>
        </a>
        <div className="topbar-actions">
          <span className={`mode-badge mode-${mode}`}><span className="mode-dot" />{statusLabel(mode)}</span>
        </div>
      </header>

      <div className="app-body">
        {snapshot ? (
          <>
            <div className="snapshot-intro">
              <div><p className="section-kicker">YOUR AGENT HARNESS</p><h1>能力の現在地</h1><p>いまの環境にあるツール、知識、連携をひとつの地図にまとめています。</p></div>
              <div className="intro-meta"><span>{snapshot.environment.os}</span><span>更新 {new Date(snapshot.exportedAt).toLocaleDateString("ja-JP")}</span></div>
            </div>
            <SummaryCards snapshot={snapshot} totalCapabilities={flatItems.length} />
            {snapshotWarnings.length > 0 ? <div className="notice-panel" role="status"><strong>取り込み時の注意</strong><ul>{snapshotWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
            {secretPaths.length > 0 ? <div className="secret-alert" role="alert"><div className="alert-icon">!</div><div><strong>秘密情報の可能性を検出しました</strong><p>表示・保存前に自動マスクしました。該当パス: {secretPaths.join(", ")}</p></div></div> : null}
            <nav className="view-tabs" aria-label="表示切り替え">
              {VIEW_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={view === tab.id ? "is-active" : ""}
                  aria-current={view === tab.id ? "page" : undefined}
                  onClick={() => setView(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            {view === "map" || view === "flow" ? <ExportButtons view={view} snapshot={snapshot} items={flatItems} /> : null}
            <div className="view-panel">
              {view === "map" ? (<><FindingsPanel findings={findings} /><CapabilityChips categories={categories} /></>) : null}
              {view === "flow" ? <RecipeFlow recipes={snapshot.recipes} items={flatItems} /> : null}
              {view === "inventory" ? <InventoryView snapshot={snapshot} /> : null}
              {view === "history" ? (
                <HistoryView snapshots={history} loading={historyLoading} error={historyError} onRefresh={() => { void refreshHistory(); }} onDelete={handleDelete} onCompare={handleCompare} onError={formatImportError} />
              ) : null}
            </div>
          </>
        ) : (
          <>
            {parseErrors.length > 0 ? <div className="load-error" role="alert"><strong>スナップショットを読み込めませんでした</strong><ul>{parseErrors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
            {mode === "loading" ? (
              <div className="loading-state" role="status"><span className="spinner" />ローカルスナップショットを確認しています…</div>
            ) : (
              <div className="unavailable-state">
                <span className="empty-icon">◷</span>
                <h2>スナップショットがありません</h2>
                <p>この画面は <code>npx harness-portal</code> が立てたローカルサーバー上でだけ動きます。ターミナルで実行し直すと、表示された <code>http://localhost:&lt;port&gt;</code> が開きます。</p>
              </div>
            )}
          </>
        )}
      </div>

      <footer className="footer"><span>HARNESS PORTAL / PRIVATE BY DESIGN</span><span>履歴はこの端末（~/.harness）にのみ保存されます。外部には送信されません。</span></footer>
    </div>
  );
}
