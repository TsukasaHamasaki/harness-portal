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
import { LangContext, formatDate, makeT, readStoredLang, storeLang, translate } from "./lib/i18n";
import type { Lang, MessageKey } from "./lib/i18n";
import { parseSnapshot } from "./lib/schema";
import type { HarnessSnapshot } from "./lib/schema";
import { findSecretLike, maskDeep } from "../../shared/redact.mjs";
import { normalizeLang } from "../../shared/i18n.mjs";

type Mode = "loading" | "local" | "unavailable";
type View = "map" | "flow" | "inventory" | "history";

const VIEW_TABS: ReadonlyArray<{ id: View; key: MessageKey }> = [
  { id: "map", key: "tabMap" },
  { id: "flow", key: "tabFlow" },
  { id: "inventory", key: "tabInventory" },
  { id: "history", key: "tabHistory" },
];

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

function statusKey(mode: Mode): MessageKey {
  if (mode === "local") return "modeLocal";
  if (mode === "unavailable") return "modeUnavailable";
  return "modeChecking";
}

export default function App() {
  // 既定は日本語。ブラウザに記憶があればそれを、無ければスナップショット生成時の言語（CLI の --lang / OS 判定）に合わせる
  const [lang, setLang] = useState<Lang>(() => readStoredLang() ?? "ja");
  const [langPinned, setLangPinned] = useState<boolean>(() => readStoredLang() !== null);
  const [mode, setMode] = useState<Mode>("loading");
  const [snapshot, setSnapshot] = useState<HarnessSnapshot | null>(null);
  const [view, setView] = useState<View>("map");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [snapshotWarnings, setSnapshotWarnings] = useState<string[]>([]);
  const [secretPaths, setSecretPaths] = useState<string[]>([]);
  const [history, setHistory] = useState<SnapshotMeta[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyStore = useMemo(() => createLocalHistoryStore({ lang }), [lang]);
  const t = useMemo(() => makeT(lang), [lang]);

  const categories = useMemo(() => snapshot ? buildCapabilityMap(snapshot, lang) : [], [snapshot, lang]);
  const flatItems = useMemo(() => categories.flatMap((category) => category.items), [categories]);
  const findings = useMemo(() => (snapshot ? findHarnessFindings(snapshot, lang) : []), [snapshot, lang]);

  const formatLoadError = useCallback((error: unknown): string => {
    return error instanceof Error ? error.message : translate(lang, "loadFailed");
  }, [lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  function chooseLang(next: Lang): void {
    setLang(next);
    setLangPinned(true);
    storeLang(next);
  }

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
          const generatedIn = normalizeLang(result.snapshot.environment.language);
          if (!langPinned && generatedIn) setLang(generatedIn);
          try {
            setHistory(await historyStore.listSnapshots());
            setHistoryError(null);
          } catch (error) {
            setHistoryError(formatLoadError(error));
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
    // 初回読み込みだけ。言語切替で再取得はしない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await historyStore.listSnapshots());
    } catch (error) {
      setHistoryError(formatLoadError(error));
    } finally {
      setHistoryLoading(false);
    }
  }, [historyStore, formatLoadError]);

  async function handleCompare(fileIds: [string, string]) {
    const [beforeRaw, afterRaw] = await Promise.all(fileIds.map((fileId) => historyStore.loadSnapshot(fileId)));
    const beforeResult = parseAndMask(beforeRaw);
    const afterResult = parseAndMask(afterRaw);
    if (!beforeResult.snapshot || !afterResult.snapshot) throw new Error(translate(lang, "compareLoadFailed"));
    return diffSnapshots(beforeResult.snapshot, afterResult.snapshot);
  }

  async function handleDelete(fileId: string): Promise<void> {
    await historyStore.deleteSnapshot(fileId);
    setHistory((current) => current.filter((item) => item.fileId !== fileId));
  }

  return (
    <LangContext.Provider value={lang}>
      <div className="app-shell">
        <header className="topbar">
          <a className="brand" href="/" aria-label={t("brandHomeAria")}>
            <span className="brand-mark">H</span>
            <span><strong>HARNESS</strong><small>PORTAL</small></span>
          </a>
          <div className="topbar-actions">
            <div className="lang-switch" role="group" aria-label={t("langSwitchAria")} data-testid="lang-switch">
              {(["ja", "en"] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  className={lang === candidate ? "is-active" : ""}
                  aria-pressed={lang === candidate}
                  onClick={() => chooseLang(candidate)}
                >
                  {candidate.toUpperCase()}
                </button>
              ))}
            </div>
            <span className={`mode-badge mode-${mode}`}><span className="mode-dot" />{t(statusKey(mode))}</span>
          </div>
        </header>

        <div className="app-body">
          {snapshot ? (
            <>
              <div className="snapshot-intro">
                <div><p className="section-kicker">{t("introKicker")}</p><h1>{t("introTitle")}</h1><p>{t("introLead")}</p></div>
                <div className="intro-meta"><span>{snapshot.environment.os}</span><span>{t("introUpdated", formatDate(snapshot.exportedAt, lang))}</span></div>
              </div>
              <SummaryCards snapshot={snapshot} totalCapabilities={flatItems.length} />
              {snapshotWarnings.length > 0 ? <div className="notice-panel" role="status"><strong>{t("noticeTitle")}</strong><ul>{snapshotWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
              {secretPaths.length > 0 ? <div className="secret-alert" role="alert"><div className="alert-icon">!</div><div><strong>{t("secretTitle")}</strong><p>{t("secretBody", secretPaths.join(", "))}</p></div></div> : null}
              <nav className="view-tabs" aria-label={t("tabsAria")}>
                {VIEW_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={view === tab.id ? "is-active" : ""}
                    aria-current={view === tab.id ? "page" : undefined}
                    onClick={() => setView(tab.id)}
                  >
                    {t(tab.key)}
                  </button>
                ))}
              </nav>
              {view === "map" || view === "flow" ? <ExportButtons view={view} snapshot={snapshot} items={flatItems} /> : null}
              <div className="view-panel">
                {view === "map" ? (<><FindingsPanel findings={findings} /><CapabilityChips categories={categories} /></>) : null}
                {view === "flow" ? <RecipeFlow recipes={snapshot.recipes} items={flatItems} /> : null}
                {view === "inventory" ? <InventoryView snapshot={snapshot} /> : null}
                {view === "history" ? (
                  <HistoryView snapshots={history} loading={historyLoading} error={historyError} onRefresh={() => { void refreshHistory(); }} onDelete={handleDelete} onCompare={handleCompare} onError={formatLoadError} />
                ) : null}
              </div>
            </>
          ) : (
            <>
              {parseErrors.length > 0 ? <div className="load-error" role="alert"><strong>{t("loadErrorTitle")}</strong><ul>{parseErrors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
              {mode === "loading" ? (
                <div className="loading-state" role="status"><span className="spinner" />{t("loading")}</div>
              ) : (
                <div className="unavailable-state">
                  <span className="empty-icon">◷</span>
                  <h2>{t("unavailableTitle")}</h2>
                  <p>{t("unavailableBodyBefore")}<code>npx harness-portal</code>{t("unavailableBodyMiddle")}<code>http://localhost:&lt;port&gt;</code>{t("unavailableBodyAfter")}</p>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="footer"><span>{t("footerBrand")}</span><span>{t("footerNote")}</span></footer>
      </div>
    </LangContext.Provider>
  );
}
