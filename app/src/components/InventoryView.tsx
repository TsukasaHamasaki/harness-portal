import { buildCapabilityMap } from "../lib/capabilities";
import type { HarnessSnapshot } from "../lib/schema";

type InventoryViewProps = {
  snapshot: HarnessSnapshot;
};

const STATUS_LABEL: Record<HarnessSnapshot["mcpServers"][number]["status"], string> = {
  connected: "接続済み",
  "needs-auth": "要認証",
  failed: "失敗",
  unknown: "不明",
};

const KIND_LABELS = [
  ["skills", "スキル", "🧩"],
  ["agents", "エージェント", "🤖"],
  ["plugins", "プラグイン", "🧷"],
  ["commands", "コマンド", "⌘"],
] as const;

function categoryLabel(snapshot: HarnessSnapshot, id: string): string {
  const category = buildCapabilityMap(snapshot).flatMap((entry) => entry.items).find((item) => item.id.endsWith(`:${id}`) || item.id === id);
  return category?.categoryId ?? "other";
}

export function InventoryView({ snapshot }: InventoryViewProps) {
  const categories = buildCapabilityMap(snapshot);

  return (
    <section className="inventory-view" aria-labelledby="inventory-heading">
      <div className="view-heading">
        <p className="section-kicker">INVENTORY</p>
        <h2 id="inventory-heading">構成要素の一覧</h2>
        <p className="view-description">収集されたリソースと実行環境の設定を、カテゴリ別に確認できます。</p>
      </div>

      <div className="inventory-layout">
        <div className="inventory-main">
          <section className="inventory-section" aria-labelledby="mcp-heading">
            <div className="inventory-section-title"><h3 id="mcp-heading">🔌 MCPサーバー</h3><span>{snapshot.mcpServers.length}件</span></div>
            {snapshot.mcpServers.length > 0 ? (
              <div className="inventory-list">
                {snapshot.mcpServers.map((server) => (
                  <article className="inventory-row" key={server.id}>
                    <div className="inventory-row-icon">🔌</div>
                    <div className="inventory-row-content">
                      <strong>{server.id}</strong>
                      <span>{server.scope} / {server.transport}{server.host ? ` / ${server.host}` : ""}</span>
                    </div>
                    <span className={`status-badge status-${server.status}`} data-status={server.status}>{STATUS_LABEL[server.status]}</span>
                  </article>
                ))}
              </div>
            ) : <p className="empty-state">MCPサーバーはありません。</p>}
          </section>

          {KIND_LABELS.map(([key, label, emoji]) => {
            const items = key === "skills" ? snapshot.skills.map((item) => ({ id: item.id, title: item.name, detail: item.description, category: item.category }))
              : key === "agents" ? snapshot.agents.map((item) => ({ id: item.id, title: item.id, detail: item.description, category: item.category }))
                : key === "plugins" ? snapshot.plugins.map((item) => ({ id: item.id, title: item.id, detail: `${item.marketplace} / v${item.version}`, category: null }))
                  : snapshot.commands.map((item) => ({ id: item.id, title: item.id, detail: `${item.scope} scope`, category: null }));
            return (
              <section className="inventory-section" key={key} aria-labelledby={`${key}-heading`}>
                <div className="inventory-section-title"><h3 id={`${key}-heading`}>{emoji} {label}</h3><span>{items.length}件</span></div>
                {items.length > 0 ? (
                  <div className="inventory-list compact-list">
                    {items.map((item) => (
                      <article className="inventory-row" key={item.id}>
                        <div className="inventory-row-content"><strong>{item.title}</strong><span>{item.detail}</span></div>
                        <span className="category-chip">{categories.find((category) => category.id === (item.category ?? categoryLabel(snapshot, item.id)))?.label ?? "その他"}</span>
                      </article>
                    ))}
                  </div>
                ) : <p className="empty-state">設定されている項目はありません。</p>}
              </section>
            );
          })}

          <section className="inventory-section" aria-labelledby="hooks-heading">
            <div className="inventory-section-title"><h3 id="hooks-heading">🪝 hooks</h3><span>{snapshot.hooks.length}件</span></div>
            {snapshot.hooks.length > 0 ? (
              <div className="inventory-list compact-list">
                {snapshot.hooks.map((hook) => (
                  <article className="inventory-row" key={hook.event}>
                    <div className="inventory-row-content"><strong>{hook.event}: {hook.count}</strong><span>イベント実行回数</span></div>
                  </article>
                ))}
              </div>
            ) : <p className="empty-state">hooksはありません。</p>}
          </section>
        </div>

        <aside className="inventory-aside">
          <section className="info-panel">
            <div className="inventory-section-title"><h3>⚙ 設定</h3></div>
            <dl className="metadata-list">
              <div><dt>OS</dt><dd>{snapshot.environment.os}</dd></div>
              <div><dt>Claude</dt><dd>{snapshot.environment.claudeVersion ?? "未取得"}</dd></div>
              <div><dt>モデル</dt><dd>{snapshot.settings.model ?? snapshot.environment.model ?? "未設定"}</dd></div>
              <div><dt>Effort</dt><dd>{snapshot.settings.effortLevel ?? "未設定"}</dd></div>
              <div><dt>環境変数キー</dt><dd>{snapshot.settings.envKeyNames.length}件（値は非表示）</dd></div>
            </dl>
          </section>
          <section className="info-panel">
            <div className="inventory-section-title"><h3>📄 CLAUDE.md</h3><span>{snapshot.claudeMd.sections.length}件</span></div>
            {snapshot.claudeMd.sections.length > 0 ? <ul className="plain-list">{snapshot.claudeMd.sections.map((section) => <li key={section}>{section}</li>)}</ul> : <p className="empty-state">セクションはありません。</p>}
          </section>
          <section className="info-panel">
            <div className="inventory-section-title"><h3>🔐 許可カテゴリ</h3><span>{snapshot.permissions.allowCount}件</span></div>
            {Object.keys(snapshot.permissions.categories).length > 0 ? <ul className="plain-list">{Object.entries(snapshot.permissions.categories).map(([category, count]) => <li key={category}><span>{category}</span><strong>{count}</strong></li>)}</ul> : <p className="empty-state">許可カテゴリはありません。</p>}
          </section>
        </aside>
      </div>
    </section>
  );
}
