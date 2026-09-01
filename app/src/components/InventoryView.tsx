import { buildCapabilityMap } from "../lib/capabilities";
import type { HarnessSnapshot } from "../lib/schema";
import { countLabel, useLang, useT } from "../lib/i18n";
import type { MessageKey } from "../lib/i18n";
import { kindLabel } from "../lib/kind-colors";
import { categoryLabel as sharedCategoryLabel } from "../../../shared/categories.mjs";

type InventoryViewProps = {
  snapshot: HarnessSnapshot;
};

const STATUS_KEY: Record<HarnessSnapshot["mcpServers"][number]["status"], MessageKey> = {
  connected: "statusConnected",
  "needs-auth": "statusNeedsAuth",
  failed: "statusFailed",
  unknown: "statusUnknown",
};

const KIND_SECTIONS = [
  ["skills", "skill", "🧩"],
  ["agents", "agent", "🤖"],
  ["plugins", "plugin", "🧷"],
  ["commands", "command", "⌘"],
] as const;

function categoryOf(snapshot: HarnessSnapshot, id: string): string {
  const category = buildCapabilityMap(snapshot).flatMap((entry) => entry.items).find((item) => item.id.endsWith(`:${id}`) || item.id === id);
  return category?.categoryId ?? "other";
}

export function InventoryView({ snapshot }: InventoryViewProps) {
  const t = useT();
  const lang = useLang();
  const categories = buildCapabilityMap(snapshot, lang);
  const count = (n: number) => countLabel(n, lang);

  return (
    <section className="inventory-view" aria-labelledby="inventory-heading">
      <div className="view-heading">
        <p className="section-kicker">{t("inventoryKicker")}</p>
        <h2 id="inventory-heading">{t("inventoryTitle")}</h2>
        <p className="view-description">{t("inventoryLead")}</p>
      </div>

      <div className="inventory-layout">
        <div className="inventory-main">
          <section className="inventory-section" aria-labelledby="mcp-heading">
            <div className="inventory-section-title"><h3 id="mcp-heading">🔌 {t("inventoryMcp")}</h3><span>{count(snapshot.mcpServers.length)}</span></div>
            {snapshot.mcpServers.length > 0 ? (
              <div className="inventory-list">
                {snapshot.mcpServers.map((server) => (
                  <article className="inventory-row" key={server.id}>
                    <div className="inventory-row-icon">🔌</div>
                    <div className="inventory-row-content">
                      <strong>{server.id}</strong>
                      <span>{server.scope} / {server.transport}{server.host ? ` / ${server.host}` : ""}</span>
                    </div>
                    <span className={`status-badge status-${server.status}`} data-status={server.status}>{t(STATUS_KEY[server.status])}</span>
                  </article>
                ))}
              </div>
            ) : <p className="empty-state">{t("inventoryMcpEmpty")}</p>}
          </section>

          {KIND_SECTIONS.map(([key, kind, emoji]) => {
            const items = key === "skills" ? snapshot.skills.map((item) => ({ id: item.id, title: item.name, detail: item.description, category: item.category }))
              : key === "agents" ? snapshot.agents.map((item) => ({ id: item.id, title: item.id, detail: item.description, category: item.category }))
                : key === "plugins" ? snapshot.plugins.map((item) => ({ id: item.id, title: item.id, detail: `${item.marketplace} / v${item.version}`, category: null }))
                  : snapshot.commands.map((item) => ({ id: item.id, title: item.id, detail: `${item.scope} scope`, category: null }));
            return (
              <section className="inventory-section" key={key} aria-labelledby={`${key}-heading`}>
                <div className="inventory-section-title"><h3 id={`${key}-heading`}>{emoji} {kindLabel(kind, lang)}</h3><span>{count(items.length)}</span></div>
                {items.length > 0 ? (
                  <div className="inventory-list compact-list">
                    {items.map((item) => (
                      <article className="inventory-row" key={item.id}>
                        <div className="inventory-row-content"><strong>{item.title}</strong><span>{item.detail}</span></div>
                        <span className="category-chip">{categories.find((category) => category.id === (item.category ?? categoryOf(snapshot, item.id)))?.label ?? sharedCategoryLabel("other", lang)}</span>
                      </article>
                    ))}
                  </div>
                ) : <p className="empty-state">{t("inventoryEmpty")}</p>}
              </section>
            );
          })}

          <section className="inventory-section" aria-labelledby="hooks-heading">
            <div className="inventory-section-title"><h3 id="hooks-heading">🪝 hooks</h3><span>{count(snapshot.hooks.length)}</span></div>
            {snapshot.hooks.length > 0 ? (
              <div className="inventory-list compact-list">
                {snapshot.hooks.map((hook) => (
                  <article className="inventory-row" key={hook.event}>
                    <div className="inventory-row-content"><strong>{hook.event}: {hook.count}</strong><span>{t("inventoryHooksNote")}</span></div>
                  </article>
                ))}
              </div>
            ) : <p className="empty-state">{t("inventoryHooksEmpty")}</p>}
          </section>
        </div>

        <aside className="inventory-aside">
          <section className="info-panel">
            <div className="inventory-section-title"><h3>⚙ {t("inventorySettings")}</h3></div>
            <dl className="metadata-list">
              <div><dt>OS</dt><dd>{snapshot.environment.os}</dd></div>
              <div><dt>Claude</dt><dd>{snapshot.environment.claudeVersion ?? t("inventoryNotFetched")}</dd></div>
              <div><dt>{t("inventoryModel")}</dt><dd>{snapshot.settings.model ?? snapshot.environment.model ?? t("inventoryUnset")}</dd></div>
              <div><dt>Effort</dt><dd>{snapshot.settings.effortLevel ?? t("inventoryUnset")}</dd></div>
              <div><dt>{t("inventoryEnvKeys")}</dt><dd>{t("inventoryEnvKeysValue", snapshot.settings.envKeyNames.length)}</dd></div>
            </dl>
          </section>
          <section className="info-panel">
            <div className="inventory-section-title"><h3>📄 CLAUDE.md</h3><span>{count(snapshot.claudeMd.sections.length)}</span></div>
            {snapshot.claudeMd.sections.length > 0 ? <ul className="plain-list">{snapshot.claudeMd.sections.map((section) => <li key={section}>{section}</li>)}</ul> : <p className="empty-state">{t("inventorySectionsEmpty")}</p>}
          </section>
          <section className="info-panel">
            <div className="inventory-section-title"><h3>🔐 {t("inventoryPermissions")}</h3><span>{count(snapshot.permissions.allowCount)}</span></div>
            {Object.keys(snapshot.permissions.categories).length > 0 ? <ul className="plain-list">{Object.entries(snapshot.permissions.categories).map(([category, n]) => <li key={category}><span>{category}</span><strong>{n}</strong></li>)}</ul> : <p className="empty-state">{t("inventoryPermissionsEmpty")}</p>}
          </section>
        </aside>
      </div>
    </section>
  );
}
