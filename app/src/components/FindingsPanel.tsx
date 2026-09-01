import type { HarnessFinding } from "../lib/findings";
import { countLabel, useLang, useT } from "../lib/i18n";

type FindingsPanelProps = {
  findings: HarnessFinding[];
};

export function FindingsPanel({ findings }: FindingsPanelProps) {
  const t = useT();
  const lang = useLang();
  if (findings.length === 0) return null;

  return (
    <section className="findings-panel" data-testid="findings-panel" aria-label={t("findingsAria")}>
      <h2 className="findings-heading">
        {t("findingsHeading")}
        <span>{countLabel(findings.length, lang)}</span>
      </h2>
      {findings.map((finding) => (
        <article
          key={finding.id}
          className="finding-card"
          data-testid="finding"
          data-kind={finding.kind}
        >
          <svg
            className="finding-icon"
            viewBox="0 0 12 12"
            width="12"
            height="12"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M6 0.5 11.5 10.5 0.5 10.5Z" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
            <rect x="5.4" y="4" width="1.2" height="3.2" />
            <rect x="5.4" y="8" width="1.2" height="1.2" />
          </svg>
          <div>
            <p className="finding-title">{finding.title}</p>
            <p className="finding-question">{finding.question}</p>
            <dl className="finding-entries">
              {finding.entries.map((entry, index) => (
                <div className="finding-entry" key={`${finding.id}-${index}`}>
                  <dt className="finding-entry-label">{entry.label}</dt>
                  <dd className="finding-entry-detail">{entry.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </article>
      ))}
    </section>
  );
}
