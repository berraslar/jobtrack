export const SOURCE: string;
export const OUTPUT: string;
export const ORIGIN_PLACEHOLDER: string;
export function buildBookmarklet(source: string): Promise<string>;
export function renderModule(href: string): string;
