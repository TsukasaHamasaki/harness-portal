import type { CapabilityItem } from "../lib/capabilities";
import { KIND_COLORS, KIND_LABELS_JA, kindLabel } from "../lib/kind-colors";
import { useLang, useT } from "../lib/i18n";

export const CAPABILITY_KIND_LABEL = KIND_LABELS_JA;

type CapabilityDetailDialogProps = {
  item: CapabilityItem;
  onClose: () => void;
};

export function CapabilityDetailDialog({ item, onClose }: CapabilityDetailDialogProps) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-kind-dot" style={{ backgroundColor: KIND_COLORS[item.kind] }} aria-hidden="true" />
            <div>
              <p className="modal-kind">{kindLabel(item.kind, lang)}</p>
              <h2 id="detail-title">{item.title}</h2>
            </div>
          </div>
          <button className="icon-button" type="button" aria-label={t("closeDetail")} onClick={onClose}>×</button>
        </div>
        {item.source === "fallback" ? <p className="detail-notice">{t("fallbackNotice")}</p> : null}
        <p className="detail-summary">{item.summary || t("noDescription")}</p>
        {item.triggers.length > 0 ? (
          <div className="detail-block">
            <h3>{t("triggersHeading")}</h3>
            <div className="trigger-list">{item.triggers.map((trigger) => <span key={trigger}>{trigger}</span>)}</div>
          </div>
        ) : null}
        <div className="detail-block">
          <h3>{t("detailHeading")}</h3>
          <p className="detail-text">{item.detail || t("noDescription")}</p>
        </div>
        <div className="detail-id">ID: {item.id}</div>
      </div>
    </div>
  );
}
