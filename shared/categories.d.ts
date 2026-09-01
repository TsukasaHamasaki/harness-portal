export type CategoryId =
  | "browser"
  | "docs"
  | "media"
  | "transcribe"
  | "writing"
  | "ec"
  | "gws"
  | "notion"
  | "web"
  | "research"
  | "dev"
  | "data"
  | "comm"
  | "other";

export declare const CATEGORIES: { id: CategoryId; label: string; labelEn: string; emoji: string; order: number }[];
export declare const CATEGORY_IDS: CategoryId[];
export declare function isCategoryId(value: unknown): value is CategoryId;
export declare function classifyByRule(name: unknown, description: unknown): CategoryId | null;
export declare function categoryLabel(id: string, lang?: "ja" | "en"): string;
