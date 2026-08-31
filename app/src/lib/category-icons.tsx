import type { JSX } from "react";
import type { CategoryId } from "../../../shared/categories.mjs";

const SVG_BASE = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": "true" as const,
};

const ICONS: Record<CategoryId, (className: string | undefined) => JSX.Element> = {
  // browser: globe
  browser: (className) => (
    <svg {...SVG_BASE} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.7 4 6 4 9s-1.5 6.3-4 9c-2.5-2.7-4-6-4-9s1.5-6.3 4-9Z" />
    </svg>
  ),
  // docs: presentation / document with lines
  docs: (className) => (
    <svg {...SVG_BASE} className={className}>
      <rect x="3" y="4" width="18" height="12" rx="1" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
      <path d="M7 9h10" />
      <path d="M7 12.5h6" />
    </svg>
  ),
  // media: film / play
  media: (className) => (
    <svg {...SVG_BASE} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M10 9.5v5l4.5-2.5Z" />
    </svg>
  ),
  // transcribe: microphone
  transcribe: (className) => (
    <svg {...SVG_BASE} className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </svg>
  ),
  // writing: pencil
  writing: (className) => (
    <svg {...SVG_BASE} className={className}>
      <path d="M17 3l4 4L8 20l-5 1 1-5Z" />
      <path d="M14.5 5.5l4 4" />
    </svg>
  ),
  // ec: shopping cart
  ec: (className) => (
    <svg {...SVG_BASE} className={className}>
      <circle cx="9" cy="20" r="1.2" />
      <circle cx="18" cy="20" r="1.2" />
      <path d="M2 3h2l2.6 12.2a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L21 8H6" />
    </svg>
  ),
  // gws: mail/envelope
  gws: (className) => (
    <svg {...SVG_BASE} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5 12 13l8.5-6.5" />
    </svg>
  ),
  // notion: layout / kanban card grid
  notion: (className) => (
    <svg {...SVG_BASE} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="M13.5 8h4" />
      <path d="M13.5 12h4" />
    </svg>
  ),
  // web: site / window with globe-like link
  web: (className) => (
    <svg {...SVG_BASE} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <circle cx="6" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  // research: magnifying glass
  research: (className) => (
    <svg {...SVG_BASE} className={className}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.8-4.8" />
    </svg>
  ),
  // dev: code brackets
  dev: (className) => (
    <svg {...SVG_BASE} className={className}>
      <path d="M9 6 3 12l6 6" />
      <path d="M15 6l6 6-6 6" />
    </svg>
  ),
  // data: bar chart
  data: (className) => (
    <svg {...SVG_BASE} className={className}>
      <path d="M4 20V10" />
      <path d="M12 20V4" />
      <path d="M20 20v-7" />
      <path d="M3 20h18" />
    </svg>
  ),
  // comm: chat bubble
  comm: (className) => (
    <svg {...SVG_BASE} className={className}>
      <path d="M4 5h16v11H8l-4 4Z" />
    </svg>
  ),
  // other: box
  other: (className) => (
    <svg {...SVG_BASE} className={className}>
      <path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  ),
};

function FallbackIcon(className: string | undefined): JSX.Element {
  return (
    <svg {...SVG_BASE} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

export function CategoryIcon(props: { id: CategoryId; className?: string }): JSX.Element {
  const render = ICONS[props.id] ?? FallbackIcon;
  return render(props.className);
}
