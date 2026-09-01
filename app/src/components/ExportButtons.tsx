import { buildStandaloneHtml } from "../lib/export-html";
import type { HarnessSnapshot } from "../lib/schema";
import type { CapabilityItem } from "../lib/capabilities";
import { buildAllSkillPromptEntries } from "../lib/skill-prompt";
import { buildZip } from "../lib/zip";
import { translate, useLang, useT } from "../lib/i18n";
import type { Lang } from "../lib/i18n";

type ExportButtonsProps = {
  view: "map" | "flow";
  snapshot: HarnessSnapshot;
  items: CapabilityItem[];
};

function exportedAtDatePart(exportedAt: unknown): string {
  if (typeof exportedAt !== "string" || !exportedAt.includes("T")) return "unknown";
  const datePart = exportedAt.split("T")[0];
  return datePart.length > 0 ? datePart : "unknown";
}

function downloadHtml(view: "map" | "flow", snapshot: HarnessSnapshot, lang: Lang) {
  const title = view === "flow" ? translate(lang, "exportTitleFlow") : translate(lang, "exportTitleMap");
  const html = buildStandaloneHtml({ title, view, snapshot, lang });
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `harness-${view}-${exportedAtDatePart(snapshot.exportedAt)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadSkillPromptsZip(snapshot: HarnessSnapshot, items: CapabilityItem[], lang: Lang) {
  const entries = buildAllSkillPromptEntries({ recipes: snapshot.recipes, items, lang });
  const bytes = buildZip(entries, new Date(snapshot.exportedAt));
  const blob = new Blob([bytes.slice()], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `harness-skill-prompts-${exportedAtDatePart(snapshot.exportedAt)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportButtons({ view, snapshot, items }: ExportButtonsProps) {
  const t = useT();
  const lang = useLang();
  const hasRecipes = snapshot.recipes && snapshot.recipes.length > 0;
  return (
    <div className="export-bar">
      <button
        type="button"
        className="export-button"
        style={{ borderRadius: "var(--radius-control)", boxShadow: "var(--shadow-btn)" }}
        onClick={() => downloadHtml(view, snapshot, lang)}
      >
        {t("exportHtml")}
      </button>
      <button
        type="button"
        className="export-button"
        style={{ borderRadius: "var(--radius-control)", boxShadow: "var(--shadow-btn)" }}
        onClick={() => window.print()}
      >
        {t("exportPdf")}
      </button>
      {view === "flow" && hasRecipes ? (
        <button
          type="button"
          className="export-button"
          style={{ borderRadius: "var(--radius-control)", boxShadow: "var(--shadow-btn)" }}
          data-testid="export-skill-prompts-zip"
          onClick={() => downloadSkillPromptsZip(snapshot, items, lang)}
        >
          {t("exportSkillZip")}
        </button>
      ) : null}
      <span className="export-note">{t("exportNote")}</span>
    </div>
  );
}
