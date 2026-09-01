export type Lang = "ja" | "en";
export declare const SUPPORTED_LANGS: Lang[];
export declare function normalizeLang(value: unknown): Lang | null;
export declare function detectLang(options?: { env?: Record<string, string | undefined>; intlLocale?: string }): Lang;
export declare function cliText(lang: Lang | string | null | undefined, key: string, ...args: unknown[]): string;
