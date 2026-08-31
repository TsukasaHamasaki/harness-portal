import type { CapabilityItem } from "../lib/capabilities";
import { KIND_COLORS, KIND_LABELS_JA } from "../lib/kind-colors";

export const CAPABILITY_KIND_LABEL = KIND_LABELS_JA;

type CapabilityDetailDialogProps = {
  item: CapabilityItem;
  onClose: () => void;
};

export function CapabilityDetailDialog({ item, onClose }: CapabilityDetailDialogProps) {
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
              <p className="modal-kind">{CAPABILITY_KIND_LABEL[item.kind]}</p>
              <h2 id="detail-title">{item.title}</h2>
            </div>
          </div>
          <button className="icon-button" type="button" aria-label="詳細を閉じる" onClick={onClose}>×</button>
        </div>
        {item.source === "fallback" ? <p className="detail-notice">この項目は自動分類できなかったため「その他」に置いています。</p> : null}
        <p className="detail-summary">{item.summary || "説明なし"}</p>
        {item.triggers.length > 0 ? (
          <div className="detail-block">
            <h3>こう話しかける</h3>
            <div className="trigger-list">{item.triggers.map((trigger) => <span key={trigger}>{trigger}</span>)}</div>
          </div>
        ) : null}
        <div className="detail-block">
          <h3>元の説明（全文）</h3>
          <p className="detail-text">{item.detail || "説明なし"}</p>
        </div>
        <div className="detail-id">ID: {item.id}</div>
      </div>
    </div>
  );
}
