import { useState } from "react";
import type { SnapshotDiff } from "../lib/diff";
import type { SnapshotMeta } from "../lib/history";

type HistoryViewProps = {
  snapshots: SnapshotMeta[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onDelete: (fileId: string) => Promise<void>;
  onCompare: (fileIds: [string, string]) => Promise<SnapshotDiff>;
  onError?: (error: unknown) => string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ja-JP");
}

function DiffList({ title, items, tone }: { title: string; items: { id: string; title: string }[]; tone: "added" | "removed" | "changed" }) {
  const headingId = `diff-${tone}-heading`;
  return (
    <section className={`diff-section diff-${tone}`} aria-labelledby={headingId}>
      <div className="diff-heading"><h4 id={headingId}>{title}</h4><span>{items.length}</span></div>
      {items.length > 0 ? <ul>{items.map((item) => <li key={item.id}>{item.title}</li>)}</ul> : <p>なし</p>}
    </section>
  );
}

export function HistoryView({ snapshots, loading, error, onRefresh, onDelete, onCompare, onError }: HistoryViewProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [comparing, setComparing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function errorMessage(error: unknown): string {
    if (onError) return onError(error);
    return error instanceof Error ? error.message : "履歴ストアとの通信に失敗しました。";
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
    if (!window.confirm("このスナップショットを削除しますか？")) return;
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
        <div><p className="section-kicker">HISTORY</p><h2 id="history-heading">履歴と差分</h2><p className="view-description">2件を選ぶと、能力の追加・削除・変更を比較できます。</p></div>
        <button className="button button-secondary" type="button" onClick={() => onRefresh()} disabled={loading}>{loading ? "更新中…" : "↻ 履歴を更新"}</button>
      </div>
      {error || actionError ? <div className="inline-alert" role="alert">{error ?? actionError}</div> : null}
      {snapshots.length === 0 && !loading ? <div className="history-empty"><span className="empty-icon">◷</span><h3>保存されたスナップショットはありません</h3><p>現在の状態を保存すると、ここから履歴を比較できます。</p></div> : null}
      {snapshots.length > 0 ? (
        <>
          <div className="history-toolbar"><span>{selected.length}/2件を選択</span><button className="button button-primary" type="button" disabled={selected.length !== 2 || comparing} onClick={compare}>{comparing ? "比較中…" : "選択した2件を比較"}</button></div>
          <div className="snapshot-list">
            {snapshots.map((snapshot) => (
              <article className={`snapshot-row${selected.includes(snapshot.fileId) ? " is-selected" : ""}`} key={snapshot.fileId}>
                <label className="snapshot-select"><input type="checkbox" checked={selected.includes(snapshot.fileId)} onChange={() => toggleSelection(snapshot.fileId)} /><span className="custom-checkbox" /></label>
                <div className="snapshot-main"><strong>{snapshot.label || "無題のスナップショット"}</strong><span>{formatDate(snapshot.createdTime || snapshot.exportedAt)}</span></div>
                <div className="snapshot-counts">{snapshot.counts.skills ?? 0} skills · {snapshot.counts.mcpServers ?? 0} MCP</div>
                <button className="icon-button danger-button" type="button" aria-label={`${snapshot.label}を削除`} disabled={deleting === snapshot.fileId} onClick={() => remove(snapshot.fileId)}>×</button>
              </article>
            ))}
          </div>
          {diff ? (
            <section className="diff-result" aria-labelledby="diff-heading">
              <div className="diff-result-heading"><div><p className="section-kicker">COMPARISON</p><h3 id="diff-heading">スナップショットの差分</h3></div><span className="unchanged-count">不変 {diff.unchangedCount}件</span></div>
              <div className="diff-grid">
                <DiffList title="追加" tone="added" items={diff.added.map((item) => ({ id: item.id, title: item.title }))} />
                <DiffList title="削除" tone="removed" items={diff.removed.map((item) => ({ id: item.id, title: item.title }))} />
                <DiffList title="変更" tone="changed" items={diff.changed.map((item) => ({ id: item.after.id, title: `${item.after.title}（${item.fields.join("・")}）` }))} />
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
