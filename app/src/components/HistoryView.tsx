import { useState } from "react";
import type { SnapshotDiff } from "../lib/diff";
import type { SnapshotMeta } from "../lib/history";
import { countLabel, formatDateTime, useLang, useT } from "../lib/i18n";

type HistoryViewProps = {
  snapshots: SnapshotMeta[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onDelete: (fileId: string) => Promise<void>;
  onCompare: (fileIds: [string, string]) => Promise<SnapshotDiff>;
  onError?: (error: unknown) => string;
};

function DiffList({ title, items, tone, none }: { title: string; items: { id: string; title: string }[]; tone: "added" | "removed" | "changed"; none: string }) {
  const headingId = `diff-${tone}-heading`;
  return (
    <section className={`diff-section diff-${tone}`} aria-labelledby={headingId}>
      <div className="diff-heading"><h4 id={headingId}>{title}</h4><span>{items.length}</span></div>
      {items.length > 0 ? <ul>{items.map((item) => <li key={item.id}>{item.title}</li>)}</ul> : <p>{none}</p>}
    </section>
  );
}

export function HistoryView({ snapshots, loading, error, onRefresh, onDelete, onCompare, onError }: HistoryViewProps) {
  const t = useT();
  const lang = useLang();
  const [selected, setSelected] = useState<string[]>([]);
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [comparing, setComparing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function errorMessage(error: unknown): string {
    if (onError) return onError(error);
    return error instanceof Error ? error.message : t("historyStoreError");
  }

  function toggleSelection(fileId: string): void {
    setDiff(null);
    setActionError(null);
    setSelected((current) => current.includes(fileId)
      ? current.filter((id) => id !== fileId)
      : current.length < 2 ? [...current, fileId] : [current[1], fileId]);
  }

  async function compare(): Promise<void> {
    if (selected.length !== 2) return;
    setComparing(true);
    setActionError(null);
    try {
      setDiff(await onCompare([selected[0], selected[1]]));
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setComparing(false);
    }
  }

  async function remove(fileId: string): Promise<void> {
    if (!window.confirm(t("historyDeleteConfirm"))) return;
    setDeleting(fileId);
    setActionError(null);
    try {
      await onDelete(fileId);
      setSelected((current) => current.filter((id) => id !== fileId));
      setDiff(null);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="history-view" aria-labelledby="history-heading">
      <div className="view-heading history-heading-row">
        <div><p className="section-kicker">{t("historyKicker")}</p><h2 id="history-heading">{t("historyTitle")}</h2><p className="view-description">{t("historyLead")}</p></div>
        <button className="button button-secondary" type="button" onClick={() => onRefresh()} disabled={loading}>{loading ? t("historyRefreshing") : t("historyRefresh")}</button>
      </div>
      {error || actionError ? <div className="inline-alert" role="alert">{error ?? actionError}</div> : null}
      {snapshots.length === 0 && !loading ? <div className="history-empty"><span className="empty-icon">◷</span><h3>{t("historyEmptyTitle")}</h3><p>{t("historyEmptyBody")}</p></div> : null}
      {snapshots.length > 0 ? (
        <>
          <div className="history-toolbar"><span>{t("historySelected", selected.length)}</span><button className="button button-primary" type="button" disabled={selected.length !== 2 || comparing} onClick={compare}>{comparing ? t("historyComparing") : t("historyCompare")}</button></div>
          <div className="snapshot-list">
            {snapshots.map((snapshot) => (
              <article className={`snapshot-row${selected.includes(snapshot.fileId) ? " is-selected" : ""}`} key={snapshot.fileId}>
                <label className="snapshot-select"><input type="checkbox" checked={selected.includes(snapshot.fileId)} onChange={() => toggleSelection(snapshot.fileId)} /><span className="custom-checkbox" /></label>
                <div className="snapshot-main"><strong>{snapshot.label || t("historyUntitled")}</strong><span>{formatDateTime(snapshot.createdTime || snapshot.exportedAt, lang)}</span></div>
                <div className="snapshot-counts">{snapshot.counts.skills ?? 0} skills · {snapshot.counts.mcpServers ?? 0} MCP</div>
                <button className="icon-button danger-button" type="button" aria-label={t("historyDeleteAria", snapshot.label)} disabled={deleting === snapshot.fileId} onClick={() => remove(snapshot.fileId)}>×</button>
              </article>
            ))}
          </div>
          {diff ? (
            <section className="diff-result" aria-labelledby="diff-heading">
              <div className="diff-result-heading"><div><p className="section-kicker">{t("diffKicker")}</p><h3 id="diff-heading">{t("diffTitle")}</h3></div><span className="unchanged-count">{t("diffUnchanged", diff.unchangedCount)}</span></div>
              <div className="diff-grid">
                <DiffList title={t("diffAdded")} tone="added" none={t("diffNone")} items={diff.added.map((item) => ({ id: item.id, title: item.title }))} />
                <DiffList title={t("diffRemoved")} tone="removed" none={t("diffNone")} items={diff.removed.map((item) => ({ id: item.id, title: item.title }))} />
                <DiffList title={t("diffChanged")} tone="changed" none={t("diffNone")} items={diff.changed.map((item) => ({ id: item.after.id, title: lang === "ja" ? `${item.after.title}（${item.fields.join("・")}）` : `${item.after.title} (${item.fields.join(", ")})` }))} />
              </div>
            </section>
          ) : null}
        </>
      ) : null}
      <span hidden data-testid="history-count">{countLabel(snapshots.length, lang)}</span>
    </section>
  );
}
