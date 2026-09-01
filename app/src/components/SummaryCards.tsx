import type { HarnessSnapshot } from "../lib/schema";
import { formatDateTime, useLang, useT } from "../lib/i18n";

type SummaryCardsProps = {
  snapshot: HarnessSnapshot;
  totalCapabilities: number;
};

export function SummaryCards({ snapshot, totalCapabilities }: SummaryCardsProps) {
  const t = useT();
  const lang = useLang();
  const totalHooks = snapshot.hooks.reduce((total, hook) => total + hook.count, 0);
  const unit = t("countUnit");

  return (
    <section className="summary-grid" aria-label={t("summaryAria")}>
      <article className="summary-card summary-card-accent">
        <span className="summary-card-icon" aria-hidden="true">✦</span>
        <div>
          <p className="summary-card-label">{t("summaryCapabilities")}</p>
          <p className="summary-card-value" data-testid="summary-capability-count">{totalCapabilities}</p>
          <p className="summary-card-note">{t("summaryCapabilitiesNote")}</p>
        </div>
      </article>

      <article className="summary-card">
        <span className="summary-card-icon" aria-hidden="true">🪝</span>
        <div>
          <p className="summary-card-label">{t("summaryHooks")}</p>
          <p className="summary-card-value">{totalHooks}{unit ? <small>{unit}</small> : null}</p>
          <p className="summary-card-note">
            {snapshot.hooks.length > 0 ? snapshot.hooks.map((hook) => `${hook.event} ${hook.count}`).join(" / ") : t("summaryHooksNone")}
          </p>
        </div>
      </article>

      <article className="summary-card">
        <span className="summary-card-icon" aria-hidden="true">🔐</span>
        <div>
          <p className="summary-card-label">{t("summaryPermissions")}</p>
          <p className="summary-card-value">{snapshot.permissions.allowCount}{unit ? <small>{unit}</small> : null}</p>
          <p className="summary-card-note">{t("summaryPermissionsNote")}</p>
        </div>
      </article>

      <article className="summary-card">
        <span className="summary-card-icon" aria-hidden="true">◷</span>
        <div>
          <p className="summary-card-label">{t("summaryLoadedAt")}</p>
          <p className="summary-card-date">{formatDateTime(snapshot.exportedAt, lang)}</p>
          <p className="summary-card-note">{t("summaryClassifier", snapshot.environment.os, snapshot.exporter.classifier)}</p>
        </div>
      </article>
    </section>
  );
}
