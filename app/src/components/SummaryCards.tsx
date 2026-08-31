import type { HarnessSnapshot } from "../lib/schema";

type SummaryCardsProps = {
  snapshot: HarnessSnapshot;
  totalCapabilities: number;
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ja-JP");
}

export function SummaryCards({ snapshot, totalCapabilities }: SummaryCardsProps) {
  const totalHooks = snapshot.hooks.reduce((total, hook) => total + hook.count, 0);

  return (
    <section className="summary-grid" aria-label="スナップショット概要">
      <article className="summary-card summary-card-accent">
        <span className="summary-card-icon" aria-hidden="true">✦</span>
        <div>
          <p className="summary-card-label">検出した能力</p>
          <p className="summary-card-value" data-testid="summary-capability-count">{totalCapabilities}</p>
          <p className="summary-card-note">5種類のリソースを横断</p>
        </div>
      </article>

      <article className="summary-card">
        <span className="summary-card-icon" aria-hidden="true">🪝</span>
        <div>
          <p className="summary-card-label">Hooks</p>
          <p className="summary-card-value">{totalHooks}<small>件</small></p>
          <p className="summary-card-note">
            {snapshot.hooks.length > 0 ? snapshot.hooks.map((hook) => `${hook.event} ${hook.count}`).join(" / ") : "設定なし"}
          </p>
        </div>
      </article>

      <article className="summary-card">
        <span className="summary-card-icon" aria-hidden="true">🔐</span>
        <div>
          <p className="summary-card-label">Permissions</p>
          <p className="summary-card-value">{snapshot.permissions.allowCount}<small>件</small></p>
          <p className="summary-card-note">許可済みの操作</p>
        </div>
      </article>

      <article className="summary-card">
        <span className="summary-card-icon" aria-hidden="true">◷</span>
        <div>
          <p className="summary-card-label">読み込み日時</p>
          <p className="summary-card-date">{formatDate(snapshot.exportedAt)}</p>
          <p className="summary-card-note">{snapshot.environment.os} / {snapshot.exporter.classifier} 分類</p>
        </div>
      </article>
    </section>
  );
}

